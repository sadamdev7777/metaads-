# TravelCRM: hashed contacts for Meta Conversions API

**For:** the TravelBoost CRM (TravelCRM) team
**Why:** MTB Marketing AI sends each paid deposit to Meta as a "Purchase" event, so Meta learns who actually pays and finds more people like them. Meta can only match a buyer through their phone or email. The TravelCRM connector masks both today, so nothing can be matched.

## What to add

To the booking rows returned by `search_bookings` (the TravelCRM MCP tool the nightly loader already uses), add three fields:

| Field | Type | Content |
|---|---|---|
| `phone_sha256` | string or null | SHA-256 (lowercase hex, 64 characters) of the customer's normalised phone number |
| `email_sha256` | string or null | SHA-256 (lowercase hex, 64 characters) of the customer's normalised email |
| `paid_amount` | number or null | Total approved payments on the booking so far, in MYR |

Never return the raw phone or email. Only the hash leaves TravelCRM.

## How to normalise before hashing

Phone:
1. Keep digits only (drop spaces, dashes, brackets, `+`).
2. If it starts with `0`, replace that `0` with `60`. If it starts with `1` and has 9 or 10 digits, put `60` in front.
3. Foreign numbers: keep the country code as given, digits only.
4. Example: `012-345 6789` becomes `60123456789`, then SHA-256 of that string.

Email:
1. Trim spaces, then lowercase.
2. Example: ` Ali.Abu@Gmail.com ` becomes `ali.abu@gmail.com`, then SHA-256 of that string.

If a value is missing or invalid, return `null` for that field.

## Check

Each hash is 64 lowercase hex characters. Test with one booking whose phone you know: normalise it by hand as above, hash it with any SHA-256 tool, and compare with what `search_bookings` returns.

## What happens on the MTB Marketing AI side (already built)

- The nightly loader stores `phone_sha256`, `email_sha256` and `paid_amount` with each booking (the database accepts only 64-character hex in the hash columns).
- At 01:40 every night, `capi-send` sends new paid deposits of the last 7 days to the MTB pixel as `Purchase`, with `event_id = mtb-booking-<booking id>` so nothing is counted twice.
- It stays switched off until the first test passes in Meta Events Manager, Test events.
