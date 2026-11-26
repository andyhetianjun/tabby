# Design notes

Deeper detail on how Tabby works. The README has the short version.

## Parts and decisions

```
 mobile app (Expo)                    API (Fastify)                  database
 ------------------                   --------------                 --------
 typed client  --- JSON + zod --->    routes (zod validated)  --->   SQLite (default)
 cache + outbox <-- JSON + zod ---    uses @tabby/core               or Postgres

            both import @tabby/core: the split and settle-up code, and the zod schemas
```

- **Money is integer cents.** Amounts are parsed from text like `"12.50"` without going through a float. The largest accepted amount is 1 billion, so intermediate math stays inside safe integers.
- **Splitting** supports equal, exact amounts, shares and percent. Shares and percent use the largest remainder method: everyone gets the rounded-down amount, then the leftover cents go one at a time to the people with the biggest fractional part. Ties go to whoever is listed first, so an equal split of $10.00 three ways is $3.34, $3.33, $3.33. The shares always add up to the total.
- **Balances** credit the payer and debit each person's share. Payments recorded through "Mark as paid" count too. Balances across a group always add up to zero.
- **Settle up** first pairs any debtor and creditor with exactly equal amounts, then greedily has the biggest debtor pay the biggest creditor. It never uses more than (people with a non-zero balance minus one) transfers. Finding the true minimum is a harder problem (it is related to subset sum), so greedy can sometimes use one more transfer than the best answer.
- **Auth** is deliberately simple: you give a name, the server returns a random token and stores only its hash. There are no passwords and no outside providers. It is fine for a demo and not meant for real accounts.
- **Groups and people.** The creator becomes the first member. Anyone can add more people by name, and a group has an invite code. Someone who joins with the code either claims a name that was already added or becomes a new member.
- **Offline.** The app saves each successful read and shows the last saved copy (with a banner) when the server cannot be reached. If you add an expense while offline it is stored on the phone and uploaded the next time you open that group. Each expense carries a client-generated id, so a retry never creates a duplicate. Settling up and deleting need a connection.

I wrote a small SQL layer by hand (two drivers, one set of `?` statements) instead of using an ORM, because I wanted the SQLite and Postgres paths to be easy to read side by side.

