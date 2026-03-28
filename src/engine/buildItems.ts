import { BUILD_ITEMS } from '../data/content';
import { BuildItemDefinition, BuildItemId, GameState, RoomTypeId } from '../types/game';

export const getBuildItemDef = (itemId: BuildItemId): BuildItemDefinition | undefined => BUILD_ITEMS.find((item) => item.id === itemId);

const getRoomAt = (state: GameState, x: number, y: number) => state.rooms.find((room) => room.x === x && room.y === y);

const isAdjacentToAnyRoomType = (state: GameState, x: number, y: number, roomTypes: RoomTypeId[]): boolean => {
  const offsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  return offsets.some((offset) => {
    const room = getRoomAt(state, x + offset.x, y + offset.y);
    return room && roomTypes.includes(room.type);
  });
};

export const getItemEffectTotals = (state: GameState): {
  waitingComfort: number;
  wayfinding: number;
  adminEfficiency: number;
  treatmentQuality: number;
  moraleRecovery: number;
} =>
  state.placedItems.reduce(
    (sum, placed) => {
      const def = getBuildItemDef(placed.itemId);
      if (!def) return sum;
      return {
        waitingComfort: sum.waitingComfort + (def.effects.waitingComfort ?? 0),
        wayfinding: sum.wayfinding + (def.effects.wayfinding ?? 0),
        adminEfficiency: sum.adminEfficiency + (def.effects.adminEfficiency ?? 0),
        treatmentQuality: sum.treatmentQuality + (def.effects.treatmentQuality ?? 0),
        moraleRecovery: sum.moraleRecovery + (def.effects.moraleRecovery ?? 0)
      };
    },
    { waitingComfort: 0, wayfinding: 0, adminEfficiency: 0, treatmentQuality: 0, moraleRecovery: 0 }
  );

export const getBuildItemMaintenancePerDay = (state: GameState): number =>
  state.placedItems.reduce((sum, placed) => sum + (getBuildItemDef(placed.itemId)?.maintenance ?? 0), 0);

export const getBuildItemPlacementError = (state: GameState, itemId: BuildItemId, x: number, y: number): string | null => {
  const def = getBuildItemDef(itemId);
  if (!def) return 'Unknown item.';

  const room = getRoomAt(state, x, y);
  const isPath = state.pathTiles.some((tile) => tile.x === x && tile.y === y);

  if (def.placement.roomTypes?.length) {
    if (!room || !def.placement.roomTypes.includes(room.type)) {
      return `Must be placed in: ${def.placement.roomTypes.join(', ')}.`;
    }
  } else {
    if (room) return 'This item cannot be placed directly inside a room.';
    if (!def.placement.allowOnPath && isPath) return 'This item cannot be placed on hallway path tiles.';
    if (!def.placement.allowOnEmpty && !isPath) return 'This item must be placed on a path tile.';
  }

  if (def.placement.requiresAdjacentRoomTypes?.length) {
    const adjacentOk = isAdjacentToAnyRoomType(state, x, y, def.placement.requiresAdjacentRoomTypes);
    if (!adjacentOk) return `Needs adjacency to: ${def.placement.requiresAdjacentRoomTypes.join(', ')}.`;
  }

  const maxPerTile = def.placement.maxPerTile ?? 1;
  const currentTileCount = state.placedItems.filter((item) => item.x === x && item.y === y).length;
  if (currentTileCount >= maxPerTile) return `Tile limit reached (${maxPerTile}).`;

  return null;
};
