import { useEffect, useState } from 'react'
import type { TestConditions } from '../../types'
import { getLatestConditions } from '../../storage/repository'
import { EmotionalContextFields } from '../../features/emotion-lab/components/EmotionalContextFields'
import { touchEmotionalContext } from '../../features/emotion-lab/emotionalContext'

interface Props {
  onConfirm: (conditions: TestConditions) => void
  onSkip?: () => void
  initialConditions?: TestConditions
  title?: string
  description?: string
  confirmLabel?: string
  skipLabel?: string
  showLoadPrevious?: boolean
  compact?: boolean
  /** Rótulo local opcional da relação acompanhada (Emotion Lab). */
  relationshipLabel?: string
}

export function TestConditionsForm({
  onConfirm,
  onSkip,
  initialConditions,
  title = 'Condicoes do Teste',
  description = 'Estes dados sao opcionais e ajudam a contextualizar o seu desempenho. Preencha apenas o que achar relevante.',
  confirmLabel = 'Registrar e Continuar',
  skipLabel = 'Iniciar sem registrar condicoes',
  showLoadPrevious = true,
  compact = false,
  relationshipLabel,
}: Props) {
  const [form, setForm] = useState<TestConditions>(initialConditions ?? {})
  const [loadingLatest, setLoadingLatest] = useState(false)
  const [hasPrevious, setHasPrevious] = useState(false)

  useEffect(() => {
    if (!showLoadPrevious) return
    getLatestConditions().then((cond) => {
      if (cond && Object.keys(cond).length > 0) {
        setHasPrevious(true)
      }
    })
  }, [showLoadPrevious])

  useEffect(() => {
    setForm(initialConditions ?? {})
  }, [initialConditions])

  const handleLoadPrevious = async () => {
    setLoadingLatest(true)
    const latest = await getLatestConditions()
    if (latest) {
      // `getLatestConditions` já não devolve contexto emocional (é momentâneo);
      // o que a pessoa acabou de registrar agora também não pode ser apagado.
      setForm((prev) => ({ ...latest, emotionalContext: prev.emotionalContext }))
    }
    setLoadingLatest(false)
  }

  const setNested = <K extends keyof TestConditions, SK extends keyof NonNullable<TestConditions[K]>>(
    section: K,
    field: SK,
    value: NonNullable<TestConditions[K]>[SK]
  ) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...((prev[section] as any) || {}),
        [field]: value,
      },
    }))
  }

  const setRoot = <K extends keyof Pick<TestConditions, 'notes'>>(field: K, value: TestConditions[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Sanea e carimba `updatedAt` só se o conteúdo emocional mudou de fato.
    const emotionalContext = touchEmotionalContext(
      initialConditions?.emotionalContext,
      form.emotionalContext
    )
    const conditions: TestConditions = { ...form, recordedAt: new Date().toISOString() }
    if (emotionalContext) conditions.emotionalContext = emotionalContext
    else delete conditions.emotionalContext
    onConfirm(conditions)
  }

  return (
    <div className={compact ? 'w-full' : 'p-8 max-w-2xl mx-auto w-full'}>
      <h1 className={compact ? 'text-lg font-semibold mb-2' : 'text-2xl font-semibold mb-2'}>
        {title}
      </h1>
      <p className="text-lab-muted text-sm mb-6">{description}</p>

      {showLoadPrevious && hasPrevious && (
        <button
          type="button"
          onClick={handleLoadPrevious}
          disabled={loadingLatest}
          className="btn-secondary w-full mb-6"
        >
          {loadingLatest ? 'Carregando...' : 'Usar condições da sessão anterior'}
        </button>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Sono */}
        <details className="bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
          <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
            Sono
            <span className="text-lab-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 pt-0 border-t border-lab-border grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-lab-muted">Horas dormidas</span>
              <input type="number" step="0.5" min="0" max="24"
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.sleep?.hours ?? ''}
                onChange={(e) => setNested('sleep', 'hours', e.target.value ? parseFloat(e.target.value) : undefined)} />
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Qualidade (1 a 5)</span>
              <input type="range" min="1" max="5" step="1"
                className="w-full mt-3"
                value={form.sleep?.quality ?? 3}
                onChange={(e) => setNested('sleep', 'quality', parseInt(e.target.value))} />
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Horário deitou</span>
              <input type="time"
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.sleep?.bedTime ?? ''}
                onChange={(e) => setNested('sleep', 'bedTime', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Horário acordou</span>
              <input type="time"
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.sleep?.wakeTime ?? ''}
                onChange={(e) => setNested('sleep', 'wakeTime', e.target.value)} />
            </label>
          </div>
        </details>

        {/* Estado Atual */}
        <details className="bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
          <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
            Estado Atual
            <span className="text-lab-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 pt-0 border-t border-lab-border grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['energy', 'focus', 'mood', 'stress', 'motivation', 'sleepiness'] as const).map((field) => (
              <label key={field} className="block">
                <span className="text-sm text-lab-muted capitalize">{field.replace(/([A-Z])/g, ' $1')} (1–5)</span>
                <input type="range" min="1" max="5" step="1"
                  className="w-full mt-3"
                  value={form.currentState?.[field] ?? 3}
                  onChange={(e) => setNested('currentState', field, parseInt(e.target.value))} />
              </label>
            ))}
          </div>
        </details>

        {/* Substâncias */}
        <details className="bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
          <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
            Substâncias e Medicamentos
            <span className="text-lab-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 pt-0 border-t border-lab-border grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block flex items-center gap-2 mt-4 md:col-span-2">
              <input type="checkbox"
                checked={form.substances?.caffeine ?? false}
                onChange={(e) => setNested('substances', 'caffeine', e.target.checked)} />
              <span className="text-sm">Consumiu cafeína?</span>
            </label>
            {form.substances?.caffeine && (
              <>
                <label className="block">
                  <span className="text-sm text-lab-muted">Cafeína (mg aprox.)</span>
                  <input type="number" min="0"
                    className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                    value={form.substances?.caffeineMg ?? ''}
                    onChange={(e) => setNested('substances', 'caffeineMg', e.target.value ? parseInt(e.target.value) : undefined)} />
                </label>
                <label className="block">
                  <span className="text-sm text-lab-muted">Horário da cafeína</span>
                  <input type="time"
                    className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                    value={form.substances?.caffeineTime ?? ''}
                    onChange={(e) => setNested('substances', 'caffeineTime', e.target.value)} />
                </label>
              </>
            )}
            <label className="block md:col-span-2 mt-2">
              <span className="text-sm text-lab-muted">Medicamento / Estimulante (Nome)</span>
              <input type="text"
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.substances?.medicationName ?? ''}
                onChange={(e) => setNested('substances', 'medicationName', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Dose</span>
              <input type="text"
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.substances?.medicationDose ?? ''}
                onChange={(e) => setNested('substances', 'medicationDose', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Horário (Medicação)</span>
              <input type="time"
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.substances?.medicationTime ?? ''}
                onChange={(e) => setNested('substances', 'medicationTime', e.target.value)} />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm text-lab-muted">Outros / Suplementos</span>
              <input type="text"
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.substances?.other ?? ''}
                onChange={(e) => setNested('substances', 'other', e.target.value)} />
            </label>
          </div>
        </details>

        {/* Alimentação */}
        <details className="bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
          <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
            Alimentação e Hidratação
            <span className="text-lab-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 pt-0 border-t border-lab-border grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-lab-muted">Última refeição (horas atrás)</span>
              <input type="text"
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                placeholder="Ex: 2 horas"
                value={form.nutrition?.timeSinceLastMeal ?? ''}
                onChange={(e) => setNested('nutrition', 'timeSinceLastMeal', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Tipo de refeição</span>
              <select
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.nutrition?.mealType ?? ''}
                onChange={(e) => setNested('nutrition', 'mealType', e.target.value as any)}
              >
                <option value="">Não informado</option>
                <option value="fasting">Jejum</option>
                <option value="light">Leve</option>
                <option value="normal">Normal</option>
                <option value="heavy">Pesada</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Fome (1–5)</span>
              <input type="range" min="1" max="5" step="1"
                className="w-full mt-3"
                value={form.nutrition?.hunger ?? 3}
                onChange={(e) => setNested('nutrition', 'hunger', parseInt(e.target.value))} />
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Hidratação (1–5)</span>
              <input type="range" min="1" max="5" step="1"
                className="w-full mt-3"
                value={form.nutrition?.hydration ?? 3}
                onChange={(e) => setNested('nutrition', 'hydration', parseInt(e.target.value))} />
            </label>
          </div>
        </details>

        {/* Ambiente */}
        <details className="bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
          <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
            Ambiente
            <span className="text-lab-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 pt-0 border-t border-lab-border grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-lab-muted">Nível de ruído</span>
              <select
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.environment?.noiseLevel ?? ''}
                onChange={(e) => setNested('environment', 'noiseLevel', e.target.value as any)}
              >
                <option value="">Não informado</option>
                <option value="silent">Silencioso</option>
                <option value="low">Baixo</option>
                <option value="moderate">Moderado</option>
                <option value="high">Alto</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-lab-muted">Local</span>
              <select
                className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
                value={form.environment?.location ?? ''}
                onChange={(e) => setNested('environment', 'location', e.target.value as any)}
              >
                <option value="">Não informado</option>
                <option value="bedroom">Quarto</option>
                <option value="office">Escritório</option>
                <option value="living_room">Sala</option>
                <option value="school">Escola</option>
                <option value="other">Outro</option>
              </select>
            </label>
            <label className="block flex items-center gap-2 mt-2 md:col-span-2">
              <input type="checkbox"
                checked={form.environment?.headphones ?? false}
                onChange={(e) => setNested('environment', 'headphones', e.target.checked)} />
              <span className="text-sm">Fones de ouvido</span>
            </label>
            <label className="block flex items-center gap-2 mt-2 md:col-span-2">
              <input type="checkbox"
                checked={form.environment?.distractions ?? false}
                onChange={(e) => setNested('environment', 'distractions', e.target.checked)} />
              <span className="text-sm">Presença de distrações (pessoas, etc)</span>
            </label>
          </div>
        </details>

        {/* Contexto emocional e relacional — Emotion Lab */}
        <details className="bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
          <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
            Contexto emocional e relacional
            <span className="text-lab-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 pt-4 border-t border-lab-border">
            <EmotionalContextFields
              value={form.emotionalContext}
              relationshipLabel={relationshipLabel}
              onChange={(emotionalContext) =>
                setForm((prev) => ({ ...prev, emotionalContext }))
              }
            />
          </div>
        </details>

        <label className="block">
          <span className="text-sm text-lab-muted">Observações Gerais</span>
          <textarea
            className="w-full mt-1 bg-lab-surface-2 border border-lab-border rounded-lg px-3 py-2 h-20"
            value={form.notes ?? ''}
            onChange={(e) => setRoot('notes', e.target.value)} />
        </label>

        <div className="flex flex-col sm:flex-row gap-3 pt-6">
          <button type="submit" className="btn-primary flex-1">{confirmLabel}</button>
          {onSkip && (
            <button type="button" className="btn-secondary" onClick={onSkip}>{skipLabel}</button>
          )}
        </div>
      </form>
    </div>
  )
}
