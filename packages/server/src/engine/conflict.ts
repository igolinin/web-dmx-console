import type { PatchedFixture } from '@dmx-console/shared';
import { getFixtureDef } from '../fixtures/loader.js';

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: {
    fixtureIdA: string;
    fixtureIdB: string;
    universe: number;
    overlappingChannels: number[];
  }[];
}

/** Return the set of DMX channel indices (0-based) occupied by a patched fixture. */
export function occupiedChannels(fixture: PatchedFixture): number[] {
  const def = getFixtureDef(fixture.defId);
  if (!def) return [];

  const mode = def.modes[fixture.modeIndex];
  if (!mode) return [];

  const count = mode.channelNames.length;
  return Array.from({ length: count }, (_, i) => fixture.address - 1 + i);
}

/** Check if adding/updating a fixture would cause DMX address conflicts. */
export function checkConflicts(
  candidate: PatchedFixture,
  existingFixtures: PatchedFixture[],
  excludeId?: string,
): ConflictResult {
  const candidateChannels = new Set(occupiedChannels(candidate));
  const conflicts: ConflictResult['conflicts'] = [];

  for (const existing of existingFixtures) {
    if (existing.id === candidate.id) continue;
    if (existing.id === excludeId) continue;
    if (existing.universe !== candidate.universe) continue;

    const existingChannels = occupiedChannels(existing);
    const overlapping = existingChannels.filter((ch) => candidateChannels.has(ch));

    if (overlapping.length > 0) {
      conflicts.push({
        fixtureIdA: candidate.id,
        fixtureIdB: existing.id,
        universe: candidate.universe,
        overlappingChannels: overlapping.map((ch) => ch + 1), // 1-indexed for display
      });
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}

/** Check all fixtures against each other for any conflicts. */
export function checkAllConflicts(fixtures: PatchedFixture[]): ConflictResult {
  const allConflicts: ConflictResult['conflicts'] = [];
  const checked = new Set<string>();

  for (const fixture of fixtures) {
    const result = checkConflicts(fixture, fixtures, fixture.id);
    for (const conflict of result.conflicts) {
      const key = [conflict.fixtureIdA, conflict.fixtureIdB].sort().join(':');
      if (!checked.has(key)) {
        checked.add(key);
        allConflicts.push(conflict);
      }
    }
  }

  return { hasConflict: allConflicts.length > 0, conflicts: allConflicts };
}
