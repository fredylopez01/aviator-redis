class Player {
  constructor(id, name, balance) {
    this.id = id;
    this.name = name;
    this.balance = balance;
    this.bet = 0;
    this.cashedOut = false;
    this.win = 0;
  }

  placeBet(amount) {
    if (amount <= 0 || amount > this.balance) return false;
    this.bet = amount;
    this.balance -= amount;
    return true;
  }

  cashout(multiplier) {
    if (this.bet > 0 && !this.cashedOut) {
      const winAmount = this.bet * multiplier;
      this.balance += winAmount;
      this.cashedOut = true;
      this.win = winAmount;
      return winAmount;
    }
    return 0;
  }

  resetForNextRound() {
    this.bet = 0;
    this.cashedOut = false;
    this.win = 0;
  }
}

module.exports = Player;
