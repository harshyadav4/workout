# Share links

Use one link for each place you post. Each link counts as its own page in
Vercel → Analytics → **Pages** (the free plan), then opens `/about`.

| Where you post | Link |
|---|---|
| Reddit | https://workout-one-pearl.vercel.app/r/reddit |
| Instagram (bio or story) | https://workout-one-pearl.vercel.app/r/instagram |
| X | https://workout-one-pearl.vercel.app/r/x |
| Facebook | https://workout-one-pearl.vercel.app/r/facebook |
| YouTube | https://workout-one-pearl.vercel.app/r/youtube |
| WhatsApp | https://workout-one-pearl.vercel.app/r/whatsapp |
| Telegram | https://workout-one-pearl.vercel.app/r/telegram |
| Email | https://workout-one-pearl.vercel.app/r/email |
| Friends (in person, direct message) | https://workout-one-pearl.vercel.app/r/friends |
| QR code (gym poster, flyer) | https://workout-one-pearl.vercel.app/r/qr |
| Product Hunt | https://workout-one-pearl.vercel.app/r/producthunt |

`/r/share` is used by the Share button on a finished workout.

## How to read the numbers

1. Open Vercel → the project → **Analytics**.
2. In **Pages**, each `/r/<place>` row is the number of visits from that place.
3. Click a row to filter. The other panels (countries, devices) then show only those visitors.

## Notes

- The list of places is in `lib/sources.ts`. A name that is not in the list
  still opens the app, and its UTM tag is `utm_source=other`.
- Every link also adds UTM tags to `/about`
  (`utm_source`, `utm_medium`, `utm_campaign=launch`). The UTM panel needs
  Vercel Web Analytics Plus. With Plus, these tags show with no code change.
- A visit is not a user. To count sign-ups per place, the source must be saved
  with the account (not done yet).
