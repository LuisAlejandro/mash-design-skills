# >>> maintainer-tools:ops-release BEGIN
# Managed by maintainer-tools 0.4.4. Do not edit directly.

release:
	@./scripts/release.sh $${VERSION_TYPE}

release-patch:
	@./scripts/release.sh patch $${APP_NAME}

release-minor:
	@./scripts/release.sh minor $${APP_NAME}

release-major:
	@./scripts/release.sh major $${APP_NAME}



undo-release:
	@: "$${VERSION:?Set VERSION=x.y.z before running make undo-release}"
	@VERSION=$${VERSION} ./scripts/rollback.sh release
# <<< maintainer-tools:ops-release END

# Repo-owned test targets; the Penpot/OpenDesign runtime remains under bin/mds.
TEST_COMPOSE = docker compose -p mash-design-skills-tests -f compose.test.yaml

.PHONY: test-image test test-python test-skills test-headless

test-image:
	@$(TEST_COMPOSE) build tests

test: test-python test-skills test-headless

test-python: test-image
	@$(TEST_COMPOSE) run --rm --no-deps tests python3 -m pytest tests src/skills/od-design-candidates/tests -q

test-skills: test-image
	@$(TEST_COMPOSE) run --rm --no-deps tests sh -ec 'npm test --prefix src/skills/penpot-import-html && npm test --prefix src/skills/penpot-implement-design'

test-headless: test-image
	@$(TEST_COMPOSE) run --rm --no-deps tests sh -ec 'npm run typecheck --prefix headless && npm test --prefix headless && npm run build --prefix headless'
