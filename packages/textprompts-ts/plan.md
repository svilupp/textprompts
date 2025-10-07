# textprompts-ts Fix Plan

## Critical Issues (Build-Breaking)

### 1. TypeScript Configuration Errors ✅
- [x] Fix `exactOptionalPropertyTypes` - add `strictNullChecks`
- [x] Fix `allowImportingTsExtensions` - remove (added `noEmit: true`)
- [x] Fix `verbatimModuleSyntax` re-export issue in src/index.ts:10

### 2. Runtime Dependency on Bun ✅
- [x] Replace Bun.TOML with Node.js compatible TOML parser (@iarna/toml)
- [x] Update CLI shebang to work with Node.js
- [x] Test with Node.js runtime

## High Priority Issues

### 3. API Cleanup ✅
- [x] Remove SafeString export and references
- [x] Remove .body method references (legacy) - None found
- [x] Minimize exported types - keep only public interfaces
- [x] Unexported: PromptInit, FormatOptions, FormatCallOptions, LoadPromptOptions, LoadPromptsOptions

### 4. Placeholder Formatting Bug ✅
- [x] Fix empty placeholder `{}` to consume args sequentially
- [x] Tested with sequential empty placeholders in Node.js test

### 5. Error Handling Issues ✅
- [x] Added comment explaining catch/rethrow in loaders.ts:19-23
- [x] Fix unsafe strip() check in models.ts:29 - changed to `.length === 0`
- [x] Fix maxFiles null check - changed to `!== null`

## Medium Priority Issues

### 6. TOML Serialization Safety ✅
- [x] Escape special characters in serializeMetaValue (quotes, newlines, backslashes)

### 7. Code Quality ✅
- [x] Share regex pattern constant between files (created constants.ts)
- [x] Fix maxFiles null check (0 should be valid)
- [~] console.warn - kept for now (could be improved with event emitter later)
- [~] Array mutation - clarified with comment (functional change would be breaking)

### 8. Type Safety ✅
- [x] Removed function overloads causing issues
- [x] Fixed exactOptionalPropertyTypes compatibility

## Testing

### 9. Node.js Compatibility ✅
- [x] Test all functionality with Node.js (test-node.mjs)
- [x] Test CLI with Node.js
- [x] Ensure build works without Bun
- [x] All tests passing (65 tests)

### 10. Additional Tests ⚠️
- [ ] Add CLI tests (future improvement)
- [ ] Add edge case tests for oversized inputs (future improvement)
- [ ] Test concurrent operations (future improvement)

## Documentation

### 11. Update Documentation ✅
- [x] SafeString already removed from README
- [x] Node.js compatibility verified and working
- [x] Dependencies now accurate (@iarna/toml, fast-glob)

---

## Fix Order

1. TypeScript config (critical)
2. Bun → Node.js TOML (critical)
3. API cleanup (SafeString, internal types)
4. Placeholder formatting bug
5. Error handling improvements
6. Code quality issues
7. Testing
8. Documentation
