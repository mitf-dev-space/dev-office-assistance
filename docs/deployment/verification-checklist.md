# Post-deploy verification checklist — Helm

## Automated

- [ ] `python scripts/deploy-production.py --mode probe` succeeds
- [ ] Smoke: web live 200, api live 200, api ready 200, `/api/me` 401
- [ ] `tests/smoke/production-smoke.sh` → `{"result":"pass"}`

## Browser

1. Open http://10.100.235.21:46810  
2. Sign in with a **non-default** production user  
3. Dashboard loads without console CORS errors  
4. One triage list read succeeds  

## Coexistence

- [ ] OmniTest still on :46300 / :46400  
- [ ] `ss` / `docker ps` shows no port conflicts  

## Rollback drill (staging or after backup)

- [ ] Redeploy previous SHA; health still green  
