#!/usr/bin/env bash
#
# Setup único da esteira do agente. Alvo único: a branch `forge`, onde os
# branches de trabalho `forge-<task>` fundem automaticamente.
# Requer: gh CLI autenticado com permissão de admin no repositório.
#
#   ./scripts/setup-pipeline.sh
#
# Faz (idempotente):
#   1. cria a branch `forge` a partir de `main` (se não existir);
#   2. habilita "Allow auto-merge" e "Allow squash merge" no repo;
#   3. protege `forge` — required checks de CI, SEM exigir aprovação
#      (os branches forge-* fundem sozinhos quando os checks passam).
#
set -euo pipefail

REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
echo "Repositório: $REPO"

# Checks obrigatórios = nomes dos jobs em .github/workflows/ci.yml.
# O installer Windows (NSIS, ~60min) fica de fora dos required de propósito,
# para não travar cada merge da esteira; ele continua rodando como advisory.
REQUIRED_CHECKS='[
  "Frontend (typecheck + build)",
  "Linux bundles (deb + AppImage, Ubuntu 22.04)",
  "Windows checks (clippy + tests)"
]'

# 1. branch forge a partir de main -----------------------------------------
if gh api "repos/${REPO}/branches/forge" >/dev/null 2>&1; then
  echo "✓ branch forge já existe"
else
  MAIN_SHA="$(gh api "repos/${REPO}/git/ref/heads/main" --jq .object.sha)"
  gh api -X POST "repos/${REPO}/git/refs" \
    -f "ref=refs/heads/forge" -f "sha=${MAIN_SHA}" >/dev/null
  echo "✓ branch forge criada a partir de main"
fi

# 2. flags de merge do repo -------------------------------------------------
gh api -X PATCH "repos/${REPO}" \
  -F allow_auto_merge=true \
  -F allow_squash_merge=true \
  -F delete_branch_on_merge=true >/dev/null
echo "✓ auto-merge + squash + delete-on-merge habilitados"

# 3. proteção de forge (sem aprovação humana) -------------------------------
gh api -X PUT "repos/${REPO}/branches/forge/protection" \
  --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ${REQUIRED_CHECKS} },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "✓ forge protegida (checks obrigatórios, sem aprovação)"

echo
echo "Pronto. Lembre de habilitar Settings → Copilot → 'Automatically request"
echo "Copilot review' para o review consultivo entrar sem depender da API."
