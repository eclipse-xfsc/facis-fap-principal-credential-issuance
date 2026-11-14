# BDD Executor dependency patch

Official source: https://github.com/eclipse-xfsc/bdd-executor
Pinned commit: 478909cdd735bbab8bb63ce955183713d6bb387b

The tracked patch changes only the Requests pin from 2.31.0 to 2.33.0
in setup.cfg and requirements-dev.txt. Application source is unchanged.

Run security/prepare-bdd.py --output <new-directory>/requirements.txt
from the repository root. Install that generated requirements file with
test/bdd/constraints.txt inside a virtual environment.

The preparation script verifies the official commit and exact patch scope.
It records the upstream commit and patch SHA-256 in a provenance JSON file.
The original requirements file retains the official source pin.

Security auditing, Dash resolution and the release Python SBOM use this
same preparation step. The compatibility suite exercises local HTTP
fixtures and the upstream native-script test. That example receives owner
execute permission temporarily; its original mode is restored afterwards.

eu-xfsc-bdd is absent from PyPI and cannot be checked by pip-audit.
Its source and this patch require separate review. These local tests do
not replace deployed BDD acceptance tests or IP clearance.
