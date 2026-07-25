import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  appendReviewerSkillMemory,
  getSkillMemoryTarget,
  readSkillReviewerMemory,
  resolveQaCategorySkill,
} from './qa-skill-memory.mjs'

test('routes QA views to an exact allow-listed category skill', () => {
  assert.equal(resolveQaCategorySkill({ issueCode: 'MADV_QA_ASL_DUPES' })?.id, 'mad-qa-asl')
  assert.equal(resolveQaCategorySkill({ issueCode: 'MADV_QA_APC_ORPHANS' })?.id, 'mad-qa-apc')
  assert.equal(resolveQaCategorySkill({ sourceGroup: 'ADDRESS_VARIANT' })?.id, 'mad-qa-av')
  assert.equal(resolveQaCategorySkill({ issueCode: 'UNKNOWN_QA_VIEW' }), null)
})

test('exposes the fixed skill and reviewer-memory paths for the selected case', () => {
  const target = getSkillMemoryTarget({
    id: 'case-asl',
    issueCode: 'MADV_QA_ASL_DUPES',
    qaEvidence: { viewId: 'MADV_QA_ASL_DUPES', categoryId: 'ADDPT_STRUCT_LUT' },
  })

  assert.deepEqual(target, {
    categoryCode: 'ASL',
    categoryName: 'MAD QA ASL',
    skillId: 'mad-qa-asl',
    skillName: 'MAD QA ASL',
    skillFile: 'agent-skills\\mad-qa-asl\\SKILL.md',
    memoryFile: 'agent-skills\\mad-qa-asl\\references\\reviewer-memory.md',
  })
})

test('appends, audits, deduplicates, and selectively reloads reviewer memory', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'mad-reviewer-memory-'))
  const memoryDirectory = resolve(projectRoot, 'agent-skills', 'mad-qa-asl', 'references')
  const memoryPath = resolve(memoryDirectory, 'reviewer-memory.md')
  const auditPath = resolve(projectRoot, '.runtime', 'skill-memory-events.jsonl')
  mkdirSync(memoryDirectory, { recursive: true })
  writeFileSync(memoryPath, '# Reviewer memory\n', 'utf8')

  const input = {
    caseItem: {
      id: 'MADV_QA_ASL_DUPES-ROCKPORT-1',
      issueCode: 'MADV_QA_ASL_DUPES',
      qaEvidence: { viewId: 'MADV_QA_ASL_DUPES', categoryId: 'ADDPT_STRUCT_LUT' },
    },
    draft: {
      id: 'proposal-asl-1',
      model: 'local-test-model',
    },
    reviewerFeedback: 'Keep the lookup row tied to the verified primary structure.',
    modelId: 'local-test-model',
    agentEntry: {
      title: 'Preserve the verified primary structure relationship',
      lesson: 'When duplicate lookup rows exist, retain the relationship supported by the verified primary structure.',
      applies_when: ['The QA view reports duplicate point-to-structure lookup rows.'],
      required_checks: ['Confirm the intended structure identity and structure status before removing a row.'],
      avoid: 'Do not remove both lookup rows or choose a survivor from row order alone.',
      confidence: 'high',
    },
    projectRoot,
    auditPath,
  }

  try {
    const first = appendReviewerSkillMemory(input)
    const duplicate = appendReviewerSkillMemory(input)
    const loaded = readSkillReviewerMemory('mad-qa-asl', { projectRoot })

    assert.equal(first.written, true)
    assert.equal(first.categoryCode, 'ASL')
    assert.equal(duplicate.written, false)
    assert.equal(duplicate.status, 'already-recorded')
    assert.equal(existsSync(auditPath), true)
    assert.match(readFileSync(memoryPath, 'utf8'), /verified primary structure/)
    assert.match(readFileSync(memoryPath, 'utf8'), /Agent-authored reviewer lesson/)
    assert.equal(first.agentEntry.confidence, 'high')
    assert.equal(loaded.entryCount, 1)
    assert.equal(loaded.loadedEntryCount, 1)
    assert.match(loaded.instructions, /untrusted, category-scoped data/)
    assert.match(loaded.instructions, /verified primary structure/)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})
