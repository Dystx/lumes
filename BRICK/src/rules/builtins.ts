import type { Rule } from '../types';
import { arbitraryEscapeRule } from './visual/arbitrary-escape';
import { clampSoupRule } from './visual/clamp-soup';
import { forcedLayoutRule } from './visual/forced-layout';
import { genericCenteringRule } from './visual/generic-centering';
import { boundaryViolationRule } from './logic/boundary-violation';
import { ghostDefensiveRule } from './logic/ghost-defensive';
import { qwikHookLeakRule } from './logic/qwik-hook-leak';
import { zombieStateRule } from './logic/zombie-state';
import { targetSizeRule } from './wcag/target-size';
import { focusAppearanceRule } from './wcag/focus-appearance';
import { focusObscuredRule } from './wcag/focus-obscured';
import { draggingMovementsRule } from './wcag/dragging-movements';
import { calcRawPxRule } from './typo/calc-raw-px';
import { calcFontSizeRule } from './typo/calc-fontsize';
import { clsImageRule } from './perf/cls-image';
import { shadcnPropMismatchRule } from './component/shadcn';
import { astroIslandLeakRule } from './arch/astro-island-leak';

export const builtinRules: Rule[] = [
  arbitraryEscapeRule,
  clampSoupRule,
  forcedLayoutRule,
  genericCenteringRule,
  boundaryViolationRule,
  ghostDefensiveRule,
  qwikHookLeakRule,
  zombieStateRule,
  targetSizeRule,
  focusAppearanceRule,
  focusObscuredRule,
  draggingMovementsRule,
  calcRawPxRule,
  calcFontSizeRule,
  clsImageRule,
  shadcnPropMismatchRule,
  astroIslandLeakRule,
];
