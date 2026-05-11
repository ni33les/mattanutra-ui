# MattaNutra Marketing Guide

This guide explains how to create campaign links so MattaNutra can measure traffic, leads, paid-plan intent, affiliate performance, and later conversion.

## Choose the Destination Page

| Destination | Use When | Example |
| --- | --- | --- |
| Home page | Broad cold traffic that needs the brand story | `https://mattanutra.com/en` |
| Assessment | High-intent traffic where the ad clearly explains HealthScore | `https://mattanutra.com/en/assessment` |
| Blog article | Education-led campaigns and softer audiences | `https://mattanutra.com/en/blog/how-to-choose-supplements-without-wasting-money` |
| Thai assessment | Thai-language ads with clear direct response | `https://mattanutra.com/th/assessment` |

## Required Tracking Parameters

Use these on every paid, social, affiliate, or partner link:

| Parameter | Purpose | Example |
| --- | --- | --- |
| `utm_source` | Platform or partner | `facebook`, `instagram`, `line`, `tiktok`, `google`, `affiliate_name` |
| `utm_medium` | Traffic type | `paid_social`, `organic_social`, `email`, `affiliate`, `cpc` |
| `utm_campaign` | Campaign name | `healthscore_launch`, `men_45_longevity` |
| `utm_content` | Creative or placement | `video_a`, `image_b`, `story_01` |
| `utm_term` | Audience or keyword, optional | `longevity`, `sleep`, `supplements` |

## Extra Parameters for MattaNutra

These are useful for affiliate, promo, and paid-ad reporting:

| Parameter | Purpose | Example |
| --- | --- | --- |
| `campaign_id` | Stable internal campaign ID | `fb_healthscore_001` |
| `campaign_name` | Human-readable campaign name | `Facebook HealthScore Launch` |
| `promo_code` | Promo or creator code | `IAN10` |
| `affiliate_id` | Affiliate partner ID | `partner_042` |
| `affiliate_ref` | Affiliate name or source ref | `wellnesscreator` |
| `affiliate_sub_id` | Affiliate sub-campaign | `story_post` |
| `affiliate_click_id` | External affiliate click ID | passed by affiliate network |
| `ad_id` | Platform ad ID | Facebook/TikTok/Google dynamic value |
| `click_id` | Platform click ID | `fbclid`, `gclid`, `ttclid`, etc. |

## Facebook Ad Examples

Broad English campaign to the home page:

```text
https://mattanutra.com/en?utm_source=facebook&utm_medium=paid_social&utm_campaign=healthscore_launch&utm_content=video_a&campaign_id=fb_healthscore_001
```

High-intent campaign directly to assessment:

```text
https://mattanutra.com/en/assessment?utm_source=facebook&utm_medium=paid_social&utm_campaign=men_45_longevity&utm_content=image_a&utm_term=longevity&campaign_id=fb_m45_longevity_001
```

Thai campaign:

```text
https://mattanutra.com/th/assessment?utm_source=facebook&utm_medium=paid_social&utm_campaign=thai_healthscore_launch&utm_content=video_a&campaign_id=fb_th_healthscore_001
```

Facebook usually appends `fbclid` automatically. BPM will capture it where present.

## Affiliate Link Example

```text
https://mattanutra.com/en/assessment?utm_source=affiliate&utm_medium=affiliate&utm_campaign=creator_healthscore&utm_content=instagram_story&affiliate_id=partner_042&affiliate_ref=wellnesscreator&affiliate_sub_id=story_01&promo_code=CREATOR10
```

Use this format when a creator, partner, newsletter, or future affiliate network drives traffic.

## Blog Campaign Example

```text
https://mattanutra.com/en/blog/how-to-choose-supplements-without-wasting-money?utm_source=facebook&utm_medium=paid_social&utm_campaign=supplement_education&utm_content=carousel_a&campaign_id=fb_blog_education_001
```

Use blog destinations when the ad is educational, skeptical-user focused, or designed to warm up audiences before asking for assessment completion.

## Naming Rules

Keep campaign names readable and consistent:

- Use lowercase.
- Use underscores instead of spaces.
- Include audience or theme when useful.
- Keep creative names simple: `video_a`, `image_b`, `carousel_a`, `story_01`.
- Do not change campaign naming mid-flight unless deliberately starting a new campaign.

Good:

```text
utm_campaign=men_45_longevity
utm_content=video_a
```

Avoid:

```text
utm_campaign=New Campaign final FINAL 2
utm_content=Richard test maybe
```

## What BPM Will Measure

For each campaign, the admin dashboard should be able to show:

- visits
- assessment starts
- assessment completions
- HealthScore views
- Free email requests
- Precision intent
- Pro intent
- chat clicks
- product clicks
- errors and safety flags
- return reassessments

The `ray` field ties each anonymous journey together, while campaign and affiliate fields explain where the journey came from.

## Using the Admin Dashboard

The admin dashboard is designed to answer: "Which traffic and messages create qualified users?"

Current views:

- Dashboard: business summary of traffic, assessment progress, conversions, reviews, and customer-contact issues.
- Dashboard: traffic, assessment progress, Free requests, paid conversions, reviews, contact issues, and clickable trend graphing.
- Conversions: the funnel journey from landing/assessment through HealthScore, Free email, paid plan, nutrition plan, results, chat, and marketplace clicks.
- Campaigns and Leads: available to external agents through protected admin query APIs, with browser pages still to be completed.
- Supplements: the current supplement catalogue, list status, dose ceiling, confidence, and safety flags.
- Human Review: supplement decisions and dose-reduction notices that need or needed a person.
- Technical Alerts: operational failures or stuck work that may affect customer experience.
- Goals: customer or operational outcomes grouped by ray, with their task progress and current status.

Current timeframe windows:

- hour
- day
- week
- month
- year
- all time

Current filter controls:

- Locale: EN and TH toggle pills, both selected by default.
- Device: dropdown for all, mobile, tablet, or desktop.
- Source and medium: use `utm_source`, `utm_medium`, traffic source, or source channel.
- Campaign: use `utm_campaign` or campaign name.
- Campaign ID: use `campaign_id`.
- Affiliate: use `affiliate_id`, `affiliate_ref`, or `affiliate_sub_id`.
- Promo code: use `promo_code`.
- Plan, plan ID, ray, and email hash for narrower debugging.

Recommended campaign review:

1. Start with the full week view.
2. Filter by `utm_source`.
3. Add `utm_campaign` or `campaign_id`.
4. Compare EN vs TH.
5. Check mobile separately if completion looks weak.
6. Use the Conversions view to find the step where users stop.
7. Use Dashboard and Conversions views to compare Free, Precision, and Pro conversion.
8. Check Technical Alerts if a campaign suddenly drops, because broken email, AI, or job processing can make a good campaign look bad.

## Campaign QA Checklist

Before launching any ad:

1. Open the final URL in a private browser.
2. Confirm it lands on the intended language and page.
3. Confirm the URL contains `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content`.
4. Confirm any affiliate or promo fields are present when needed.
5. Complete a test assessment from that URL.
6. Confirm the admin dashboard or BPM table shows the source and campaign.
7. Keep a copy of the final URL in the campaign tracker.

## Recommended Campaign Tests

Start with small tests:

| Test | Destination | Question |
| --- | --- | --- |
| Direct HealthScore | Assessment | Do users complete the quiz when the ad is clear? |
| Education first | Blog article | Do skeptical users convert better after reading? |
| Brand first | Home page | Does broader storytelling drive cheaper qualified traffic? |
| Thai direct response | Thai assessment | Does a direct Thai offer outperform English? |
| Creator/affiliate | Assessment with affiliate params | Can partners drive measurable leads? |

## Plain-English Rule

Every campaign link should answer three questions:

1. Where did this person come from?
2. Which ad, partner, or message brought them here?
3. What did they do after they arrived?
