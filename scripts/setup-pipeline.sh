#!/usr/bin/env bash
#
# Setup único da esteira do agente:
#   forge-<task> --auto--> forge --manual--> staging --manual--> main
# Requer: gh CLI autenticado com permissão de admin no repositório.
#
#   ./scripts/setup-pipeline.sh
#
# Faz (idempotente):
#   1. cria as branches `forge` e `staging` a partir de `main` (se não existirem);
#   2. habilita "Allow auto-merge" e "Allow squash merge" no repo;
#   3. protege `forge`   — required checks de CI + "Forge agent review", SEM
#      aprovação humana (forge-* funde sozinho quando o harness aprova);
#   4. protege `staging` — required checks + 1 aprovação humana (blocos);
#   5. protege `main`    — required checks + 1 aprovação + histórico linear.
#
set -euo pipefail

REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
echo "Repositório: $REPO"

# Checks de CI obrigatórios = nomes dos jobs em ci.yml. O installer Windows
# (NSIS, ~60min) fica de fora dos required de propósito; roda como advisory.
CI_CHECKS='"Frontend (typecheck + build)","Linux bundles (deb + AppImage, Ubuntu 22.04)","Windows checks (clippy + tests)"'
# forge exige também o gate do harness.
FORGE_CHECKS="[${CI_CHECKS},\"Forge agent review\"]"
GATE_CHECKS="[${CI_CHECKS}]"

create_branch() {  # $1 = nome
  if gh api "repos/${REPO}/branches/$1" >/dev/null 2>&1; then
    echo "✓ branch $1 já existe"
  else
    local sha; sha="$(gh api "repos/${REPO}/git/ref/heads/main" --jq .object.sha)"
    gh api -X POST "repos/${REPO}/git/refs" -f "ref=refs/heads/$1" -f "sha=${sha}" >/dev/null
    echo "✓ branch $1 criada a partir de main"
  fi
}

create_branch forge
create_branch staging

gh api -X PATCH "repos/${REPO}" \
  -F allow_auto_merge=true -F allow_squash_merge=true -F delete_branch_on_merge=true >/dev/null
echo "✓ auto-merge + squash + delete-on-merge habilitados"

# forge — auto-merge sem humano, gate = checks de CI + harness ---------------
gh api -X PUT "repos/${REPO}/branches/forge/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ${FORGE_CHECKS} },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "✓ forge protegida (CI + Forge agent review, sem aprovação)"

# staging — manual, 1 aprovação ---------------------------------------------
gh api -X PUT "repos/${REPO}/branches/staging/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ${GATE_CHECKS} },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "dismiss_stale_reviews": true },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "✓ staging protegida (checks + 1 aprovação)"

# main — manual, 1 aprovação + histórico linear -----------------------------
gh api -X PUT "repos/${REPO}/branches/main/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ${GATE_CHECKS} },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "dismiss_stale_reviews": true, "require_code_owner_reviews": false },
  "required_linear_history": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "✓ main protegida (checks + 1 aprovação + linear)"

echo
echo "Pronto. A esteira está armada: forge-* funde sozinho em forge quando o"
echo "harness aprova; forge→staging e staging→main ficam como PRs manuais."
