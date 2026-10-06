# Vercel deployment policy

Mossvale production deploys from the `main` branch. Pull requests and all other branches are for development and must not publish Vercel deployments. Do not promote a preview or deploy production as part of ordinary issue work.

## Project setting

In the Vercel project dashboard, open **Settings → Environments → Production** and set **Production Branch** to `main`. This is a project-level setting and cannot be enforced by a repository file. Verify the displayed branch after changing it; repository checks cannot inspect this dashboard value.

## Repository guard

`vercel.json` defines an Ignored Build Step: commits whose `VERCEL_GIT_COMMIT_REF` is not `main` exit with code `0` (skip the build/deployment); `main` exits with code `1` (continue the existing Vercel build). Keep the existing framework and build settings unchanged when editing this guard.

The guard is defense in depth for branch/PR builds. It does not replace setting the Vercel Production Branch to `main`, and it does not itself publish or promote a deployment.
