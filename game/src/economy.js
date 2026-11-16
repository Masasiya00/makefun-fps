// The economy: money earned per round and spent in the buy menu. Numbers are
// the yard's own (CS-like shape, not CS values): a kill pays $300, a round
// win $3,250, a loss $1,900. Weapons and gear are priced in weapon.js.
export const REWARDS = { kill: 300, win: 3250, loss: 1900, plant: 300 };

export function createEconomy() {
  const state = { money: 800, roundWins: 0, roundLosses: 0 };

  return {
    state,
    canAfford(price) {
      return state.money >= price;
    },
    spend(price) {
      if (state.money < price) return false;
      state.money -= price;
      return true;
    },
    earn(amount) {
      state.money += amount;
    },
    roundEnd(won) {
      if (won) {
        state.money += REWARDS.win;
        state.roundWins += 1;
      } else {
        state.money += REWARDS.loss;
        state.roundLosses += 1;
      }
    },
    reset() {
      state.money = 800;
      state.roundWins = 0;
      state.roundLosses = 0;
    },
  };
}
