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

## What happens next

Your pull request gets a review, and sometimes a small follow-up commit on your branch to fit it in with the rest of Panalume. It's then merged with you as the author, goes out in the next release, and you're credited in the release notes. Thank you!
