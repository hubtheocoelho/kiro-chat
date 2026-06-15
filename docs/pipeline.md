# Esteira do agente (forge-<task> → forge)

Automação de review + merge para o trabalho de agentes. Cada branch de trabalho
do agente vira um PR que **funde automaticamente** numa única branch de
integração, `forge`, quando os checks de CI passam.

```
forge-<task>  ──auto-merge──▶  forge
(agente trabalha)             (integração)
  CI + Copilot review          coleção do trabalho
  auto-merge (squash)          dos agentes
```

## Branches

| Branch         | Papel                  | Como entra código                                      |
|----------------|------------------------|--------------------------------------------------------|
| `forge-<task>` | Trabalho do agente     | Push direto do agente                                  |
| `forge`        | Integração             | **Auto-merge** do PR `forge-*` quando os checks passam |

**Convenção:** branches de trabalho usam o prefixo `forge-` (ex.: `forge-fix-pty`,
`forge-feat-login`). Só elas entram na esteira automática. `main` fica fora desta
automação — promover `forge → main` é manual (PR comum, quando você quiser).

## Fluxo

1. **Agente** faz push numa branch `forge-<task>`.
2. **`ci.yml`** roda nessa branch (typecheck, build, clippy, tests — Windows + Linux).
3. **`forge-pipeline.yml`** abre (ou reaproveita) um PR `forge-* → forge`, pede
   review do **Copilot** (consultivo) e liga **auto-merge (squash)**.
4. O GitHub funde para `forge` **só quando os required checks ficam verdes**
   (garantido pela branch protection de `forge`).

## Gates de CI/CD

Required status checks (em `forge`) = jobs de `ci.yml`:

- `Frontend (typecheck + build)`
- `Linux bundles (deb + AppImage, Ubuntu 22.04)`
- `Windows checks (clippy + tests)`

O job `Windows installer (NSIS bundle)` (~60 min) roda como **advisory** — não é
required para não travar cada merge da esteira.

> **Por que o review do Copilot não é o gate?** Reviews do Copilot são
> consultivos: comentam e podem pedir mudanças, mas não contam como *approving
> review*. O gate de merge são os checks de CI; o Copilot agrega contexto no PR.

## Branch protection

| Branch  | Required checks | Aprovações | Force-push | Extra               |
|---------|-----------------|------------|------------|---------------------|
| `forge` | sim             | **0**      | bloqueado  | strict (up to date) |

`forge` sem aprovação obrigatória é o que permite o **auto-merge sem humano**
para `forge-*` — o controle de qualidade fica nos required checks de CI.

## Setup único

Rode uma vez, com `gh` autenticado como admin do repo:

```bash
./scripts/setup-pipeline.sh
```

O script cria `forge`, habilita auto-merge/squash no repo e aplica a branch
protection acima (idempotente).

Depois, ligue **Settings → Copilot → "Automatically request Copilot review"**
para o review consultivo entrar sem depender da chamada de API best-effort.

## Arquivos

- `.github/workflows/forge-pipeline.yml` — `forge-* → forge` (PR + Copilot + auto-merge).
- `.github/workflows/ci.yml` — os checks que servem de gate (inalterado).
- `.github/workflows/release.yml` — release por tag (inalterado).
- `scripts/setup-pipeline.sh` — setup da branch `forge` + proteção.
