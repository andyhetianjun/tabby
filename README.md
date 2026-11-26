# Tabby

[![CI](https://github.com/andyhetianjun/tabby/actions/workflows/ci.yml/badge.svg)](https://github.com/andyhetianjun/tabby/actions/workflows/ci.yml)

A small shared-expenses app for roommates and trips: add what each person paid, split it, and see who owes whom. I built it to practice a few things I find interesting together: money math without floats, a typed API, and a React Native app that still shows something when the connection drops.

It is a monorepo with three parts.

| Folder | What it is |
| --- | --- |
| `packages/core` | Money as integer cents, expense splitting, balances, settle-up, and the request/response schemas shared by the API and the app |
| `apps/api` | Fastify + Zod API, SQLite by default, Postgres when `DATABASE_URL` is set |
| `apps/mobile` | Expo (React Native, expo-router) app: group list, group detail with balances, add expense, settle up |

## How it works

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

## Run it

You need Node 20 or newer.

```bash
npm install

# 1. API on http://localhost:3000 (SQLite file at apps/api/tabby.db)
npm run dev:api

# 2. Mobile app, in a second terminal
npm run dev:mobile
```

### Try it on a phone with Expo Go

1. Install Expo Go from the App Store or Google Play.
2. Put the phone on the same Wi-Fi as your computer.
3. Find your computer's local address (for example `192.168.1.20`).
4. Run `npm run dev:api` and `npm run dev:mobile`, then scan the QR code with the phone (Camera app on iPhone, Expo Go on Android).
5. On the sign-in screen, type your name and set the server address to `http://192.168.1.20:3000` (use your own address; `localhost` only works in a simulator or the browser).

To run in a browser instead, start the mobile app and press `w`.

### Demo flow

1. Sign in as "Andy" and create a group called "Cabin trip".
2. Open the group and add two people, Sam and Priya.
3. Add an expense: Groceries, 100.00, paid by Andy, split equally. The preview shows $33.34 / $33.33 / $33.33.
4. Add another with "Exact amounts" or "Percent" and watch the form refuse values that do not add up.
5. Back on the group screen the balances update. Open "Settle up" to see the short list of payments, and tap "Mark as paid" for each.
6. To see the offline path, stop the API, add an expense (the app saves it on the phone), start the API again and reopen the group.

Without a phone, the same flow with curl:

```bash
B=http://localhost:3000
TOKEN=$(curl -s -XPOST $B/auth/register -H 'content-type: application/json' -d '{"name":"Andy"}' | jq -r .token)
curl -s -XPOST $B/groups -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Cabin trip","currency":"CAD"}'
```

### Postgres

SQLite is the default and is what the tests use. To use Postgres:

```bash
docker compose up -d db
DATABASE_URL=postgres://tabby:tabby@localhost:5433/tabby npm run dev:api
```

The API creates its tables on start. The same integration tests can run against Postgres by setting `TEST_DATABASE_URL` (the database named there is emptied first, so use a throwaway one).

## Tests and checks

```bash
npm test            # core, API and mobile tests
npm run lint
npm run typecheck
cd apps/mobile && npx expo export --platform web   # the web build succeeds
```

What I last ran on my machine:

| Suite | Command | Result |
| --- | --- | --- |
| core (money, splitting, balances, settle-up, property tests) | `npm test -w @tabby/core` | 34 passed |
| API integration tests (Fastify `inject`, in-memory SQLite) | `npm test -w @tabby/api` | 16 passed |
| API integration tests against Postgres 16 | `TEST_DATABASE_URL=... npm test -w @tabby/api` | 16 passed |
| mobile (React Native Testing Library, jest-expo) | `npm test -w @tabby/mobile` | 17 passed |

The property tests use fast-check (100 random cases per property by default). They check that allocated shares always add up to the total and stay within one cent of the exact share, that equal splits differ by at most one cent, that group balances always sum to zero, and that applying the settle-up transfers brings every balance to zero using at most n-1 transfers.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and the web export, and runs the API tests again against a Postgres service.

I have not built or run the app on a physical phone or a simulator myself. What I verified is the web export, the tests, and the API running over HTTP.

## What I'd do next

- Rotate who gets the leftover cent so the same person is not always first.
- Real sign-in (email link or similar) and a way to recover a lost token.
- Edit an expense instead of delete and re-add.
- Let the offline queue also hold payments and deletes, and show queued expenses inside the expense list.
- Per-expense currency and conversion for trips across borders.
- Pagination for long expense lists.

## Data

There is no external data. Everything in the app is entered by the user.

## License

MIT
