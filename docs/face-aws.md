# Face check on the server (AWS Rekognition)

Built 19 Nov 2026 on branch `aws-face-1119`. **Off** until `face_aws_on = 1`. While off, the app runs the on-phone check exactly as before.

## What it does

The phone downloads nothing. It takes 3 small photos (look straight, turn left, turn right; 480 px wide, JPEG 0.8, about 40 KB each) and sends them to the edge function `face-check-aws`. The function asks AWS Rekognition in Sydney (`ap-southeast-2`):

| Call | Count | Used for |
|---|---|---|
| DetectFaces | 3 | one clear face, light, sharpness, eyes open; the two turns go in opposite directions (simple liveness) |
| CompareFaces | 1 | straight photo vs the member's card photo (`kr8_members.photo`) |
| SearchFacesByImage | 1 | the same face on another member (collection `kring-members`) |
| IndexFaces | 1 | only after a pass, or after the founder approves |

The decision rules live in `src/v8/faceAwsDecide.ts`. The function keeps an identical copy in `supabase/functions/face-check-aws/decide.ts`, and a test checks that the two match.

- **Pass**: live, one face, no other member at 95% or more, card photo at 80% or more. The member gets ✓ at once (`kr8_verifications` approved, `kr8_members.verified = true`).
- **Look-alike** (another member at 95% or more): pending, plus a `kr8_account_links` row with reason `face`, plus an amber founder alert. Nothing is blocked. The founder compares the photos and decides.
- **Card below 80%** (or no face in the card photo): pending with reason `card_mismatch` (or `no_card_face`).
- **Not live or bad photo**: retry with a friendly reason (`too_dark`, `no_face`, `many_faces`, `too_blurry`, `too_far`, `eyes_closed`, `sunglasses`, `look_straight`, `turn_left_missing`, `turn_right_missing`). Nothing is stored except a `fail` line, which counts as one of the day's tries.
- **AWS down or keys wrong**: pending with reason `aws_error`. The member is never stuck.

For a pass or a pending result, the straight photo is kept in the private bucket `kr8-verify` (`<user id>/<uuid>.jpg`, same as today) so the founder can compare. The usual 30-day selfie deletion removes it. The left and right photos are never stored.

Limits: 20 calls per member per hour (`face_aws_hour`), plus the usual `verify_tries_day`.

## Setup (once the AWS keys exist)

1. **AWS IAM user** `kring-face-check` with programmatic access only, and this policy only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KringFaceCheck",
      "Effect": "Allow",
      "Action": [
        "rekognition:DetectFaces",
        "rekognition:CompareFaces"
      ],
      "Resource": "*"
    },
    {
      "Sid": "KringFaceCollection",
      "Effect": "Allow",
      "Action": [
        "rekognition:SearchFacesByImage",
        "rekognition:IndexFaces",
        "rekognition:DeleteFaces",
        "rekognition:CreateCollection"
      ],
      "Resource": "arn:aws:rekognition:ap-southeast-2:<ACCOUNT_ID>:collection/kring-members"
    }
  ]
}
```

   DetectFaces and CompareFaces have no collection, so they need `"Resource": "*"`.

2. **Create the collection** (the function also creates it on its first search if it is missing):

```
aws rekognition create-collection --collection-id kring-members --region ap-southeast-2
```

3. **Supabase secrets**:

```
supabase secrets set AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=ap-southeast-2
# optional: FACE_AWS_COLLECTION=kring-members  FACE_AWS_YAW_SIGN=0
```

4. **Database**: apply `supabase/migrations/0125_kr8_face_aws.sql`. It only adds things and is safe to run again. It adds the config keys with `face_aws_on = 0`.

5. **Deploy the function with JWT verification on**. It checks the caller's Supabase sign-in itself too:

```
supabase functions deploy face-check-aws
```

6. **Test without AWS first** (optional): set `FACE_AWS_MOCK=1` and flip the switch on a test project. In the phone's browser console, `localStorage.kr8_face_aws_mock = 'lookalike'` (or `pass`, `card_mismatch`, `dark`, `no_turn`, `aws_down`) picks the canned answer. `FACE_AWS_MOCK_OTHER=<user id>` sets the look-alike member. Remove `FACE_AWS_MOCK` before going live.

7. **Calibrate the turn direction once**: do one real check, look at `live_check.yaw` in the newest `kr8_verifications` row (`left` and `right`). If `left` is positive, set `FACE_AWS_YAW_SIGN=1`; if it is negative, set `-1`. While it is `0`, the function only checks that the two turns are opposite, which is still enough to stop a held-up photo.

8. **Fill the collection with today's verified members** (so duplicates are found from day one). As the founder, call the function with `{ "action": "backfill", "limit": 50 }` until `left` is 0. Call `{ "action": "sweep" }` now and then. It removes faces of deleted or no-longer-verified members from AWS.

## Switch it on and off

```sql
update public.kr8_rings_config set value = 1, updated_at = now() where key = 'face_aws_on';   -- on
update public.kr8_rings_config set value = 0, updated_at = now() where key = 'face_aws_on';   -- back to the on-phone check
```

The app reads the switch through `kr8_rings_rules()` (cached for 5 minutes; if there is no answer within 2.5 s, it uses the on-phone check). If the server answers `FACE_AWS_OFF`, the app quietly opens the on-phone check instead.

Other settings: `face_aws_card_min` (80), `face_aws_dup_min` (95), `face_aws_hour` (20). `verify_auto_on = 0` sends every check to the founder.

## Cost

About 6 image calls per check: 3 DetectFaces, 1 CompareFaces, 1 SearchFacesByImage, and 1 IndexFaces on a pass. At about $0.001 per image call, that is about **$0.006 per check (≈ ฿0.2)**. 1,000 checks a month cost about $6. Stored faces cost about $0.00001 each per month. New AWS accounts may get free-tier credits; check the AWS pricing page before relying on them.

## Founder's Face checks (admin)

A server check shows the selfie next to the card photo with the AWS similarity. A look-alike also shows the other member's card photo side by side. When the founder taps Approve on a pending server check, the selfie is indexed too (`{ action: 'index', id }`).
