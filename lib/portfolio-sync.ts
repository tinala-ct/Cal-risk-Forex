import type { PortfolioState } from './portfolio';

export function portfolioFingerprint(state: PortfolioState) {
  return `${state.version}:${state.revision}:${state.updatedAt}`;
}

export function comparePortfolioFreshness(
  left: PortfolioState,
  right: PortfolioState,
) {
  if (left.revision !== right.revision) {
    return left.revision > right.revision ? 1 : -1;
  }
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  if (leftTime === rightTime) return 0;
  return leftTime > rightTime ? 1 : -1;
}
