import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import GovernedBuilderSkill, { GOVERNED_BUILDER_SKILL_NAME, governedBuilderSkill } from '../src/governed-builder-skill.js'
import GovernanceService from '../src/governance.js'

async function mountSkill(): Promise<{ ctx: Context; skillFiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  const skillFiber = ctx.plugin(GovernedBuilderSkill)
  await skillFiber
  return { ctx, skillFiber }
}

describe('governed-builder skill content (semantic)', () => {
  const content = governedBuilderSkill.content

  it('covers external authority, refresh, and independent review', () => {
    expect(content).toContain('Builder')
    expect(content).toContain('not the final reviewer or acceptor')
    expect(content).toContain('refresh')
    expect(content).toContain('independent review')
  })

  it('covers fail-closed BLOCKED and no self-accept/merge/close/successor', () => {
    expect(content).toContain('BLOCKED')
    expect(content).toContain('Do not merge your own candidate')
    expect(content).toContain('Do not close the authoritative task as accepted')
    expect(content).toContain('Do not create or activate a successor')
  })

  it('covers evidence report and read/discovery vs mutation', () => {
    expect(content).toContain('completion report')
    expect(content).toContain('Read/discovery')
    expect(content).toContain('mutation')
  })

  it('distinguishes runtime enforcement from behavioral guidance without false claims', () => {
    expect(content).toContain('Runtime-enforced')
    expect(content).toContain('not yet runtime-enforced')
    expect(content).toContain('bash, write, edit')
    expect(content).toContain('read/discovery tools')
    expect(content).toContain('governance_status')
    expect(content).toContain('not gated by that slice')
    // No false runtime-enforcement claims for path/Git/GitHub.
    expect(content).not.toContain('runtime-enforced: protected-branch')
    expect(content).not.toContain('runtime-enforced: path allowlists')
  })

  it('states runtime denial is final and must not be bypassed', () => {
    expect(content).toContain('runtime denial is final')
    expect(content).toContain('do not route around it')
  })

  it('states the pre-authority read/discovery truth precisely', () => {
    // Ungated read/discovery tools are usable before authority.
    expect(content).toContain('tool names the guard does not gate')
    expect(content).toContain('even before mutation authority')
    // But git status/diff/log through the gated bash tool still needs authority
    // (the guard is tool-name based, not command-semantics based).
    expect(content).toContain('tool-name based, not command-semantics based')
    expect(content).toContain('status/diff/log through the protected')
    expect(content).toContain('still requires an accepted')
  })
})

describe('governed-builder skill registration (real ctx.skills)', () => {
  it('exposes exactly one runtime contribution named governed-builder', async () => {
    const { ctx } = await mountSkill()
    const listed = await ctx.skills.list()
    expect(listed.map(skill => skill.name)).toEqual([GOVERNED_BUILDER_SKILL_NAME])

    const summary = listed[0]
    expect(summary?.source).toBe('runtime')
    expect(summary?.provider).toBe('dsh-governed-workflow')
  })

  it('is both model-invocable and user-invocable', async () => {
    const { ctx } = await mountSkill()
    const [summary] = await ctx.skills.list()
    expect(summary?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
  })

  it('loads the full body through ctx.skills.get()', async () => {
    const { ctx } = await mountSkill()
    const definition = await ctx.skills.get(GOVERNED_BUILDER_SKILL_NAME)
    expect(definition?.content).toBe(governedBuilderSkill.content)
    expect(definition?.name).toBe(GOVERNED_BUILDER_SKILL_NAME)
  })

  it('disposal removes the skill contribution', async () => {
    const { ctx, skillFiber } = await mountSkill()
    expect((await ctx.skills.list()).map(skill => skill.name)).toEqual([GOVERNED_BUILDER_SKILL_NAME])
    await skillFiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })
})

describe('governed-builder skill authority boundary', () => {
  it('loading the skill does not advance governance lifecycle or install authority', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(GovernanceService, {}) // no authority
    await ctx.plugin(GovernedBuilderSkill)

    await ctx.skills.get(GOVERNED_BUILDER_SKILL_NAME)

    expect(ctx.governance.snapshot().state).toBe('UNINITIALIZED')
    expect(ctx.governance.acceptedAuthority()).toBeNull()
  })
})
