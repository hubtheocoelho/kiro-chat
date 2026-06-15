# Esteira de promoção (forge → staging → main)

Automação de review + merge para o trabalho de agentes. Promove mudanças em
blocos pequenos por três níveis, com gates de CI/CD e branch protection.

```
forge-<task>   ──auto──▶   staging   ──manual──▶   main   ──tag v*──▶  release
(agente trabalha)        (integração)            (produção)         (release.yml)
   CI + Copilot          valida bloco           1 aprovação
   auto-merge            pequeno                 humana
```

## Branches

| Branch        | Papel                       | Como entra código                                   |
|---------------|-----------------------------|-----------------------------------------------------|
| `forge-<task>`| Trabalho do agente          | Push direto do agente                               |
| `staging`     | Integração / validação      | **Auto-merge** de PR `forge-*` quando os checks passam |
| `main`        | Produção                    | Merge **manual** do PR `staging → main` (1 aprovação) |
| tag `vX.Y.Z`  | Release                     | `release.yml` (inalterado) publica os instaladores  |

**Convenção:** branches do agente têm o prefixo `forge-` (ex.: `forge-fix-pty`,
`forge-feat-login`). Só branches `forge-*` entram na esteira automática.

## Fluxo

1. **Agente** faz push numa branch `forge-<task>`.
2. **`ci.yml`** roda nessa branch (typecheck, build, clippy, tests — Windows + Linux).
3. **`forge-pipeline.yml`** abre (ou reaproveita) um PR `forge-* → staging`,
   pede review do **Copilot** (consultivo) e liga **auto-merge (squash)**.
4. O GitHub funde para `staging` **só quando os required checks ficam verdes**
   (garantido pela branch protection de `staging`).
5. **`promote-to-main.yml`** mantém um PR `staging → main` aberto a cada push em
   `staging`. Esse PR **exige 1 aprovação humana** — fica parado até você revisar.
6. Após fundir em `main`, marque uma tag `vX.Y.Z` para disparar `release.yml`.

## Gates de CI/CD

Required status checks (em `staging` e `main`) = jobs de `ci.yml`:

- `Frontend (typecheck + build)`
- `Linux bundles (deb + AppImage, Ubuntu 22.04)`
- `Windows checks (clippy + tests)`

O job `Windows installer (NSIS bundle)` (~60 min) roda como **advisory** — não é
required para não travar cada merge da esteira.

> **Por que o review do Copilot não é o gate?** Reviews do Copilot são
> consultivos: comentam e podem pedir mudanças, mas não contam como *approving
> review*. O gate de merge são os checks de CI; o Copilot agrega contexto no PR.

## Branch protection

| Branch    | Required checks | Aprovações | Force-push | Extra              |
|-----------|-----------------|------------|------------|--------------------|
| `staging` | sim             | **0**      | bloqueado  | strict (up to date)|
| `main`    | sim             | **1**      | bloqueado  | histórico linear   |

`staging` sem aprovação obrigatória é o que permite o **auto-merge sem humano**
para `forge-*`. `main` com 1 aprovação é o controle manual da promoção.

## Setup único

Rode uma vez, com `gh` autenticado como admin do repo:

```bash
./scripts/setup-pipeline.sh
```

O script cria `staging`, habilita auto-merge/squash no repo e aplica as duas
branch protections acima (idempotente).

Depois, ligue **Settings → Copilot → "Automatically request Copilot review"**
para o review consultivo entrar sem depender da chamada de API best-effort.

## Arquivos

- `.github/workflows/forge-pipeline.yml` — `forge-* → staging` (PR + Copilot + auto-merge).
- `.github/workflows/promote-to-main.yml` — mantém o PR `staging → main` (manual).
- `.github/workflows/ci.yml` — os checks que servem de gate (inalterado).
- `.github/workflows/release.yml` — release por tag (inalterado).
- `scripts/setup-pipeline.sh` — setup de branches + proteção.
