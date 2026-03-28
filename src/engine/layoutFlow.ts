import { SERVICES } from '../data/content';
import { GameState, PatientVisit, RoomInstance, RoomTypeId } from '../types/game';
import { clamp } from './utils';

const GRID_SIZE = 6;
const ENTRANCE = { x: 0, y: 0 };
const CLINICAL_ROOM_TYPES: RoomTypeId[] = ['treatment', 'gym', 'vestibularLab', 'hydro', 'manualSuite', 'recoveryStudio', 'telehealthPod'];
const neighborDirs = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

type Coord = { x: number; y: number };

const coordKey = (coord: Coord) => `${coord.x},${coord.y}`;

const insideGrid = (coord: Coord) => coord.x >= 0 && coord.x < GRID_SIZE && coord.y >= 0 && coord.y < GRID_SIZE;

const roomAt = (state: GameState, coord: Coord): RoomInstance | undefined => state.rooms.find((room) => room.x === coord.x && room.y === coord.y);

const isPathTile = (state: GameState, coord: Coord) => state.pathTiles.some((tile) => tile.x === coord.x && tile.y === coord.y);

const isAlwaysWalkableRoom = (room: RoomInstance | undefined) => room?.type === 'reception' || room?.type === 'waiting';

const isWalkable = (state: GameState, coord: Coord, allowedTargets: Set<string>) => {
  if (!insideGrid(coord)) return false;
  const key = coordKey(coord);
  if (allowedTargets.has(key)) return true;
  const room = roomAt(state, coord);
  return isPathTile(state, coord) || isAlwaysWalkableRoom(room);
};

interface RouteResult {
  reachable: boolean;
  steps: number;
  path: Coord[];
}

const bfs = (state: GameState, start: Coord, goals: Coord[], allowedTargets: Set<string>): RouteResult => {
  if (goals.length === 0) return { reachable: false, steps: 999, path: [] };
  const goalKeys = new Set(goals.map(coordKey));
  const queue: Coord[] = [start];
  const visited = new Set<string>([coordKey(start)]);
  const parent = new Map<string, string | null>([[coordKey(start), null]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = coordKey(current);
    if (goalKeys.has(currentKey)) {
      const path: Coord[] = [];
      let walk: string | null = currentKey;
      while (walk) {
        const [x, y] = walk.split(',').map(Number);
        path.push({ x, y });
        walk = parent.get(walk) ?? null;
      }
      path.reverse();
      return { reachable: true, steps: Math.max(0, path.length - 1), path };
    }

    for (const dir of neighborDirs) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const nextKey = coordKey(next);
      if (visited.has(nextKey)) continue;
      if (!isWalkable(state, next, allowedTargets)) continue;
      visited.add(nextKey);
      parent.set(nextKey, currentKey);
      queue.push(next);
    }
  }

  return { reachable: false, steps: 999, path: [] };
};

export interface LayoutFlowDiagnostics {
  avgTravelTiles: number;
  waitPenaltyMinutes: number;
  throughputMultiplier: number;
  satisfactionPenalty: number;
  staffEfficiencyMultiplier: number;
  congestionIndex: number;
  warnings: string[];
  unreachableRoutes: number;
  heatmap: { x: number; y: number; load: number }[];
  routeMap: Record<RoomTypeId, { reachable: boolean; totalSteps: number }>;
}

const addPathLoad = (path: Coord[], loadMap: Map<string, number>) => {
  for (const cell of path) {
    const key = coordKey(cell);
    loadMap.set(key, (loadMap.get(key) ?? 0) + 1);
  }
};

export const analyzeLayoutFlow = (state: GameState, queue: PatientVisit[]): LayoutFlowDiagnostics => {
  const receptionRooms = state.rooms.filter((room) => room.type === 'reception').map((room) => ({ x: room.x, y: room.y }));
  const waitingRooms = state.rooms.filter((room) => room.type === 'waiting').map((room) => ({ x: room.x, y: room.y }));
  const warnings: string[] = [];
  const loadMap = new Map<string, number>();

  const routeMap = {
    reception: { reachable: false, totalSteps: 999 },
    waiting: { reachable: false, totalSteps: 999 },
    treatment: { reachable: false, totalSteps: 999 },
    gym: { reachable: false, totalSteps: 999 },
    vestibularLab: { reachable: false, totalSteps: 999 },
    hydro: { reachable: false, totalSteps: 999 },
    manualSuite: { reachable: false, totalSteps: 999 },
    recoveryStudio: { reachable: false, totalSteps: 999 },
    telehealthPod: { reachable: false, totalSteps: 999 }
  } as LayoutFlowDiagnostics['routeMap'];

  const receptionTargets = new Set(receptionRooms.map(coordKey));
  const waitingTargets = new Set(waitingRooms.map(coordKey));

  const toReception = bfs(state, ENTRANCE, receptionRooms, receptionTargets);
  routeMap.reception = { reachable: toReception.reachable, totalSteps: toReception.steps };

  if (!toReception.reachable) {
    warnings.push('Reception is isolated from the entrance path.');
  }

  const receptionToWaiting = bfs(state, receptionRooms[0] ?? ENTRANCE, waitingRooms, new Set([...receptionTargets, ...waitingTargets]));
  routeMap.waiting = { reachable: receptionToWaiting.reachable, totalSteps: receptionToWaiting.steps };
  if (!receptionToWaiting.reachable) {
    warnings.push('Reception flow is isolated from waiting.');
  }

  const queueByRoomType = new Map<RoomTypeId, number>();
  for (const visit of queue) {
    const required = SERVICES.find((service) => service.id === visit.service)?.requiredRoom ?? 'treatment';
    queueByRoomType.set(required, (queueByRoomType.get(required) ?? 0) + 1);
  }

  let routeCount = 0;
  let totalTravelTiles = 0;
  let unreachableRoutes = 0;

  for (const roomType of CLINICAL_ROOM_TYPES) {
    const rooms = state.rooms.filter((room) => room.type === roomType).map((room) => ({ x: room.x, y: room.y }));
    if (rooms.length === 0) continue;

    const routeToService = bfs(
      state,
      waitingRooms[0] ?? receptionRooms[0] ?? ENTRANCE,
      rooms,
      new Set([...rooms.map(coordKey), ...waitingRooms.map(coordKey), ...receptionRooms.map(coordKey)])
    );
    const routeBack = bfs(state, rooms[0], receptionRooms, new Set([...rooms.map(coordKey), ...receptionRooms.map(coordKey)]));

    const reachable = toReception.reachable && receptionToWaiting.reachable && routeToService.reachable && routeBack.reachable;
    const totalSteps = toReception.steps + receptionToWaiting.steps + routeToService.steps + routeBack.steps + toReception.steps;
    routeMap[roomType] = { reachable, totalSteps };

    const demandWeight = Math.max(1, queueByRoomType.get(roomType) ?? Math.round(queue.length / Math.max(1, CLINICAL_ROOM_TYPES.length)));
    if (reachable) {
      routeCount += demandWeight;
      totalTravelTiles += totalSteps * demandWeight;
      addPathLoad(toReception.path, loadMap);
      addPathLoad(receptionToWaiting.path, loadMap);
      addPathLoad(routeToService.path, loadMap);
      addPathLoad(routeBack.path, loadMap);
      addPathLoad([...toReception.path].reverse(), loadMap);
    } else {
      unreachableRoutes += demandWeight;
      warnings.push(`Some ${roomType} routes are unreachable from waiting/reception.`);
    }
  }

  const waitingCapacity = waitingRooms.length * 6;
  if (queue.length > waitingCapacity) {
    warnings.push(`Insufficient waiting capacity (${queue.length} demand vs ${waitingCapacity} comfort seats).`);
  }

  const avgTravelTiles = routeCount > 0 ? totalTravelTiles / routeCount : 0;
  if (avgTravelTiles > 14) {
    warnings.push(`Excessive travel distance (${avgTravelTiles.toFixed(1)} tiles average route).`);
  }

  const loads = [...loadMap.values()];
  const maxLoad = loads.length ? Math.max(...loads) : 0;
  const avgLoad = loads.length ? loads.reduce((sum, value) => sum + value, 0) / loads.length : 0;
  const congestionIndex = avgLoad > 0 ? maxLoad / avgLoad : 0;
  const congestionPenalty = clamp((congestionIndex - 1) * 0.12, 0, 0.2);
  const travelPenalty = clamp(avgTravelTiles / 40, 0, 0.28);
  const unreachablePenalty = clamp(unreachableRoutes / Math.max(1, queue.length), 0, 0.45);

  const throughputMultiplier = clamp(1 - travelPenalty * 0.2 - congestionPenalty * 0.45 - unreachablePenalty * 0.18, 0.75, 1);
  const staffEfficiencyMultiplier = clamp(1 - travelPenalty * 0.14 - congestionPenalty * 0.28, 0.78, 1);
  const satisfactionPenalty = clamp(travelPenalty * 0.22 + congestionPenalty * 0.33 + unreachablePenalty * 0.2, 0, 0.3);
  const waitPenaltyMinutes = Math.round(avgTravelTiles * 0.35 + congestionPenalty * 10 + unreachablePenalty * 12);

  const heatmap = [...loadMap.entries()].map(([key, load]) => {
    const [x, y] = key.split(',').map(Number);
    const normalized = maxLoad > 0 ? load / maxLoad : 0;
    return { x, y, load: Number(normalized.toFixed(2)) };
  });

  return {
    avgTravelTiles: Number(avgTravelTiles.toFixed(2)),
    waitPenaltyMinutes,
    throughputMultiplier,
    satisfactionPenalty,
    staffEfficiencyMultiplier,
    congestionIndex: Number(congestionIndex.toFixed(2)),
    warnings: [...new Set(warnings)].slice(0, 6),
    unreachableRoutes,
    heatmap,
    routeMap
  };
};
