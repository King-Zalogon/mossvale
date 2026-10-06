# Vercel deployment policy

Mossvale production deploys from the `main` branch. Changes are accumulated through pull requests into `integration`; after several are ready, one pull request from `integration` to `main` releases them together and conserves Vercel's daily deployment quota. Pull requests and other branches are for development. Do not promote a preview or deploy production as part of ordinary issue work.

## Project setting

In the Vercel project dashboard, open **Settings → Environments → Production** and set **Production Branch** to `main`. This is a project-level setting and cannot be enforced by a repository file. The project owner confirmed that the displayed Production Branch is `main` on 2026-10-06.

For the `mossvale` project in the `King-Zalogon` team, **Preview Deployments** is disabled at the project level. Pull requests and other non-production branches therefore do not create preview deployments. Keep this separate from the Production Branch setting: confirm that Production Branch remains `main` so pushes to `main` continue through the existing production build.

## Repository guard

`vercel.json` defines an Ignored Build Step: commits whose `VERCEL_GIT_COMMIT_REF` is not `main` exit with code `0` (skip the build/deployment); `main` exits with code `1` (continue the existing Vercel build). Keep the existing framework and build settings unchanged when editing this guard.

The guard is defense in depth for branch/PR builds. It does not replace setting the Vercel Production Branch to `main`, and it does not itself publish or promote a deployment.
