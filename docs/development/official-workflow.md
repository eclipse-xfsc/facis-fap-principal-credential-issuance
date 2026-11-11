# Contribution and review workflow

## One repository

`eclipse-xfsc/facis-fap-principal-credential-issuance` is the only repository in
which this application is developed. Work in progress is stored in it through pull
requests; no other repository, bundle, archive or upload carries development state.

Only Eclipse committers have write access. Every other contributor works in a public
fork of this repository that holds nothing but the branches of open pull requests.
A fork is the source of a pull request, not a development repository of its own.

## Issues

Every change starts from an issue in this repository that names the requirement or
the finding it addresses and is worded as a technical work item. A pull request names
the issues it closes, so that every change can be followed from issue to pull request
to review to merge.

## Branches and pull requests

1. Create the branch in your fork from the current `main` (or from the branch of the
   pull request yours depends on; see "Stacked pull requests"). Name it after the
   issue.
2. Open the pull request against `main` of this repository on the first day of the
   work, as a draft while the work is in progress, and push at the end of every
   development day.
3. One pull request addresses one concern. It contains the change, its tests, the
   rebuilt generated files (`dist/`, `docs/release/*.json` where affected) and the
   documentation of the change.
4. Fill in `.github/PULL_REQUEST_TEMPLATE.md` completely: the size of the change,
   the author, the AI disclosure, the named reviewer, the issues closed.
5. Mark the pull request ready for review when all checks are green. Do not
   force-push a branch that is under review; carry corrections as new commits.

### Stacked pull requests

Pull requests that build on each other are opened as a stack: each branch starts from
the head of the branch below it, and the stack is merged bottom-up. A correction to a
lower pull request is carried into the branches above it by a merge of the lower
branch, never by a rebase. When the lower pull request is merged, the next one is
retargeted to `main`.

## Commits

- Write the commit message for the reader of `git log`: what changed and why, in
  full sentences; reference the issue.
- Author and committer e-mail addresses are the addresses registered with the
  Eclipse Foundation account of the author; the Eclipse Contributor Agreement check
  on the pull request verifies this.
- Where AI-assisted tools were used, say so in the commit message with a trailer
  naming the tool and model, for example `Assisted-by: <tool> <model>`, as the
  Eclipse Project Handbook recommends, and in the pull request. AI tools are never
  named as co-authors. The author remains responsible for every line.
- Do not back-date commits and do not rewrite published history.

## Review

Every pull request is reviewed by a named reviewer who is not its author. The review
is recorded on the pull request: the questions raised, how they were resolved, and
the approval. The reviewer checks that the change does what the issue asks, that the
tests demonstrate it, that generated files were produced by the build and not edited,
and that the documentation matches the code. A pull request whose checks are red is
not reviewed.

AI-generated material is an untrusted draft until a human has reviewed it, the tests
have run and the dependency, licence and security checks have passed.

## Merge

A committer merges the pull request after the named reviewer has approved, every
review conversation is resolved and every required check is green. Pull requests are
merged with a merge commit, so that the author's commits stay in the history of
`main`; squash and rebase merges are not used. The committer accepts a contribution
only when satisfied that it is technically correct, within the project's scope and
free of obvious vulnerabilities, as the Eclipse Project Handbook requires.

The protection of `main` (pull request required, one approving review from an account
with write access, stale approvals dismissed on new commits, all conversations
resolved, required checks, no force pushes, no direct pushes, merge commits only) is
configured through the project's Otterdog configuration in `eclipse-xfsc/.eclipsefdn`.

## Required checks

Every pull request runs the workflows under `.github/workflows/`: build; unit,
component, integration and browser tests; API contract and schema validation,
including the semantic validation; Helm lint and template validation and the
Kubernetes manifest schema check of the rendered templates; the Go vet and race tests
of the participant service; the dependency and vulnerability scans of the Node.js,
Python and Go dependencies; secret scanning; the source formatting check and the
maintainability gate; the Eclipse Dash licence check; and the Eclipse ECA validation.
Images are scanned in the image build; SBOMs are generated for every release
candidate.

## Intellectual property

Contributions from authors who are not committers that contain more than 1,000 lines
of new content, contain cryptography, contain content not wholly written by the
contributor, or carry licence terms other than Apache-2.0 are submitted by a
committer to the Eclipse IP Team through IPLab before they are merged, with the pull
request as the source. Under the Eclipse IP Policy these reviews run in parallel with
development: the pull request may be merged once the review has been requested, and
no release includes the content before the IP Team has approved it. New third-party
dependencies are requested in the same way and listed in `NOTICE.md` and
`THIRD_PARTY_NOTICES.md`.

## Requirements

A change that alters the behaviour required by a MUST requirement of the Software
Requirements Specification, or that leaves one unmet, needs the prior written
agreement of the project principal and is recorded with the requirement in
`docs/requirements/requirements.json`.

## Credentials and private data

Credentials, private keys, tokens, browser-session exports, kubeconfig files and
participant records never enter the repository, a pull request, an issue or a
workflow log. The secret scan fails a pull request that contains one. Generated
reports distinguish fixture tests, real services, local checks, official CI and
formal acceptance, and a result is evidence only for the commit it names.
