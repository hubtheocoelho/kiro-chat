# Esteira do agente (forge → staging → main)

Automação de review + merge para o trabalho de agentes, com promoção em três
níveis. Os agentes trabalham e abrem PR; um harness analisa e aprova
automaticamente; ao passar, funde em `forge`. Daí pra frente é manual: `forge →
staging` em blocos de entrega e `staging → main` em versões.

```
forge-<task> ─PR─▶ harness review ─aprova─▶ forge ─manual─▶ staging ─manual─▶ main ─tag v*─▶ release
 agente trabalha    gate de merge           (auto)   blocos          versões         (release.yml)
                    (CI + QAC)                        de entrega
```

## Branches

| Branch         | Papel              | Como entra código                                              |
|----------------|--------------------|----------------------------------------------------------------|
| `forge-<task>` | Trabalho do agente | Push direto do agente                                          |
| `forge`        | Integração         | **Auto-merge** do PR `forge-*` quando CI + harness ficam verdes |
| `staging`      | Entrega (blocos)   | Merge **manual** do PR `forge → staging` (1 aprovação)         |
| `main`         | Produção (versões) | Merge **manual** do PR `staging → main` (1 aprovação)          |
| tag `vX.Y.Z`   | Release            | `release.yml` (inalterado) publica os instaladores            |

**Convenção:** branches de trabalho usam o prefixo `forge-` (ex.: `forge-fix-pty`).
Só elas entram na esteira automática.

## Fluxo

1. **Agente** faz push numa branch `forge-<task>`.
2. **`ci.yml`** roda os checks (typecheck, build, clippy, tests — Win + Linux).
3. **`forge-pipeline.yml`** abre/reaproveita o PR `forge-* → forge` e liga
   **auto-merge (squash)**.
4. **`forge-review.yml`** (o harness, check **"Forge agent review"**) analisa a
   branch e posta APPROVE ou REQUEST_CHANGES.
5. O GitHub funde em `forge` **só quando todos os required checks ficam verdes**
   (os de CI **e** o harness). É a branch protection de `forge` que segura.
6. **`promote.yml`** mantém aberto o PR `forge → staging` (e depois `staging →
   main`). Esses **exigem aprovação humana** — ficam parados até você fundir.
7. Depois de fundir em `main`, marque uma tag `vX.Y.Z` para o `release.yml`.

## O harness de review (gate)

`forge-review.yml` é o motor de aprovação automática. Hoje a regra é:

- **todo commit do agente na branch precisa dos quatro trailers QAC** (`Agent`,
  `Mode`, `What`, `Why`) — convenção do repo que, fora disto, só é garantida
  pelo hook local `.githooks/commit-msg`.

Passou → o job fica verde (o gate libera o auto-merge) e tenta um `APPROVE` no PR.
Falhou → o job fica vermelho, posta `REQUEST_CHANGES` e o auto-merge trava.

> **Por que o gate é o *check*, não a aprovação?** O `GITHUB_TOKEN` do Actions
> não pode aprovar o próprio PR (autor = `github-actions[bot]`), então o APPROVE
> é só um sinal visível best-effort. Quem realmente segura o merge é o required
> status check "Forge agent review". Para adicionar mais regras (lint, tamanho
> do diff, análise por LLM), basta estendê-las nesse workflow.

## Gates de CI/CD

Required status checks por branch:

| Branch    | Checks de CI | Forge agent review | Aprovações | Extra            |
|-----------|--------------|--------------------|------------|------------------|
| `forge`   | sim          | **sim**            | 0          | strict           |
| `staging` | sim          | —                  | **1**      | strict           |
| `main`    | sim          | —                  | **1**      | histórico linear |

Checks de CI = `Frontend (typecheck + build)`, `Linux bundles (deb + AppImage,
Ubuntu 22.04)`, `Windows checks (clippy + tests)`. O `Windows installer (NSIS
bundle)` (~60 min) é **advisory** para não travar cada merge.

`forge` sem aprovação humana é o que permite o **auto-merge** gated pelo harness.
`staging`/`main` com 1 aprovação são os controles manuais das promoções.

## Setup único

Rode uma vez, com `gh` autenticado como admin do repo:

```bash
./scripts/setup-pipeline.sh
```

Cria `forge` e `staging`, habilita auto-merge/squash e aplica as três branch
protections acima (idempotente).

## Arquivos

- `.github/workflows/forge-pipeline.yml` — abre PR `forge-* → forge` + auto-merge.
- `.github/workflows/forge-review.yml` — harness/gate "Forge agent review".
- `.github/workflows/promote.yml` — mantém PRs `forge → staging` e `staging → main` (manuais).
- `.github/workflows/ci.yml` — checks de gate (inalterado).
- `.github/workflows/release.yml` — release por tag (inalterado).
- `scripts/setup-pipeline.sh` — cria branches + branch protection.
