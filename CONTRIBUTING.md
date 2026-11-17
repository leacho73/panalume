# Contributing to Panalume

Thanks for wanting to help! Bug reports, ideas and new cards are all welcome.

## Reporting bugs and ideas

Use **New issue** and pick the form that fits: bug report, feature request, new card or question.

## Adding a card or a fix

1. Fork the repository and make your change on a branch.
2. Run it against your own Home Assistant (see **Develop** in the README). A new card is one `.svelte` file in `panalume/app/src/cards/` (see **Adding a card type**).
3. Check it on a phone-sized screen as well as a tablet or desktop.
4. Open a pull request, and tick **Allow edits by maintainers**.

A few things that keep reviews quick:

- **One card or fix per pull request.**
- **Don't change the version** in `panalume/config.yaml` or add to `CHANGELOG.md`. Both are done when a release is made, because changing the version publishes a release straight away.
- **No personal details** in code or screenshots: entity names, addresses, tokens or camera pictures from your home.

## How releases work

New versions come out once a week, on Friday mornings (UK time). Fixes for anything badly broken go out sooner.

Pull requests are taken in the order they come in, about six a week, so each release stays small enough to test properly. When there's a queue, your pull request gets a milestone showing which release it's aimed at. It may take a few weeks to land, but it hasn't been forgotten.

Panalume's cards are kept to things most setups can use. A card that only fits one particular server or app, or that does the same job as a card we already have, may be closed with a note explaining why, or we may ask for the idea to be added to an existing card instead.

## What happens next

Your pull request gets a review, and sometimes a small follow-up commit on your branch to fit it in with the rest of Panalume. It's then merged with you as the author, goes out in the release its milestone shows, and you're credited in the release notes. Thank you!
