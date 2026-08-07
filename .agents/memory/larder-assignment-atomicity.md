---
name: Larder assignment atomicity
description: The consistency rule for moving waiting-room funds into a savings bucket
---

## The rule
An assignment from an Unassigned waiting room must insert its balancing debit and bucket credit inside one database transaction.

**Why:** The two rows represent one auditable movement. If either insert succeeds without the other, native-currency balances can show a negative remainder or lose the visible bucket asset.

**How to apply:** Keep the native-currency balance validation immediately before the transaction, then perform both ledger inserts through the transaction handle and return the credited row.