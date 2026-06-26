<script setup lang="ts">
/** Voice (text-to-speech) settings modal: voice pick, rate, pitch, volume,
 *  with a 试听 preview. Reads/writes the shared useTTS settings. */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const { settings, voiceList, preview, speaking, resetSettings } = useTTS()

const voiceSelect = computed({
  get: () => settings.value.voiceURI ?? '',
  set: (v: string) => {
    settings.value = { ...settings.value, voiceURI: v || null }
  }
})

function setField<K extends keyof typeof settings.value>(key: K, value: number): void {
  settings.value = { ...settings.value, [key]: value }
}

function toggleAutoPlay(): void {
  settings.value = { ...settings.value, autoPlay: !settings.value.autoPlay }
}

function close(): void {
  emit('update:modelValue', false)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) document.addEventListener('keydown', onKey)
    else document.removeEventListener('keydown', onKey)
  }
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition name="modal">
      <div v-if="modelValue" class="modal" role="dialog" aria-modal="true" @click.self="close">
        <div class="modal__panel glass glass--strong anim-scale-in">
          <header class="modal__head">
            <span class="modal__avatar"><GlassIcon name="volume" :size="18" /></span>
            <div>
              <h3 class="modal__title">语音朗读设置</h3>
              <p class="modal__sub">调整声音、语速、音调、音量与自动播放</p>
            </div>
          </header>

          <!-- Auto-play toggle -->
          <div class="field field--toggle glass glass--subtle">
            <div class="toggle__info">
              <span class="field__label">自动朗读助手回复</span>
              <span class="field__hint">回复完成后自动播放，可随时手动停止</span>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="settings.autoPlay"
              class="switch"
              :class="{ 'switch--on': settings.autoPlay }"
              @click="toggleAutoPlay"
            >
              <span class="switch__thumb" />
            </button>
          </div>

          <!-- Voice -->
          <label class="field">
            <span class="field__label">声音</span>
            <select v-model="voiceSelect" class="glass-input field__select">
              <option value="">自动（系统中文）</option>
              <option
                v-for="v in voiceList"
                :key="v.voiceURI"
                :value="v.voiceURI"
              >
                {{ v.name }} · {{ v.lang }}
              </option>
            </select>
          </label>

          <!-- Rate -->
          <div class="field">
            <div class="field__row">
              <span class="field__label">语速</span>
              <span class="field__value">{{ settings.rate.toFixed(1) }}×</span>
            </div>
            <input
              type="range"
              class="range"
              min="0.5"
              max="2"
              step="0.1"
              :value="settings.rate"
              @input="setField('rate', Number(($event.target as HTMLInputElement).value))"
            >
          </div>

          <!-- Pitch -->
          <div class="field">
            <div class="field__row">
              <span class="field__label">音调</span>
              <span class="field__value">{{ settings.pitch.toFixed(1) }}</span>
            </div>
            <input
              type="range"
              class="range"
              min="0"
              max="2"
              step="0.1"
              :value="settings.pitch"
              @input="setField('pitch', Number(($event.target as HTMLInputElement).value))"
            >
          </div>

          <!-- Volume -->
          <div class="field">
            <div class="field__row">
              <span class="field__label">音量</span>
              <span class="field__value">{{ Math.round(settings.volume * 100) }}%</span>
            </div>
            <input
              type="range"
              class="range"
              min="0"
              max="1"
              step="0.05"
              :value="settings.volume"
              @input="setField('volume', Number(($event.target as HTMLInputElement).value))"
            >
          </div>

          <div class="modal__actions">
            <button class="glass-btn" @click="resetSettings">
              <GlassIcon name="refresh" :size="15" :stroke="2.2" /> 重置
            </button>
            <button class="glass-btn glass-btn--primary" @click="preview">
              <GlassIcon :name="speaking ? 'stop' : 'volume'" :size="15" :stroke="2.2" />
              {{ speaking ? '停止' : '试听' }}
            </button>
          </div>
        </div>
      </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: oklch(10% 0.02 var(--hue-violet) / 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.modal__panel {
  width: min(440px, 100%);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.modal__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.modal__avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.modal__title {
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.2;
}
.modal__sub {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-top: 2px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.field__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.field__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.field__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  line-height: 1.4;
}
/* Auto-play row: full-width glass card with toggle on the right */
.field--toggle {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}
.toggle__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* Toggle switch — glass track + accent thumb */
.switch {
  flex: none;
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--glass-fill-subtle);
  border: 1px solid var(--glass-border-dim);
  box-shadow: var(--inner-edge);
  cursor: pointer;
  transition: background var(--dur-normal) var(--ease-standard);
}
.switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--glass-fill-strong);
  box-shadow: var(--shadow-sm);
  transition: transform var(--dur-normal) var(--ease-spring),
    background var(--dur-normal) var(--ease-standard);
}
.switch--on {
  background: var(--accent-gradient);
  border-color: transparent;
}
.switch--on .switch__thumb {
  transform: translateX(20px);
  background: #fff;
}
.field__value {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--accent-2);
}
.field__select {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  cursor: pointer;
}

/* Range slider — glass track with accent thumb */
.range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--glass-fill-subtle);
  border: 1px solid var(--glass-border-dim);
  outline: none;
  cursor: pointer;
}
.range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent-gradient);
  border: 2px solid var(--glass-border-bright);
  box-shadow: var(--shadow-sm);
  transition: transform var(--dur-fast) var(--ease-spring);
}
.range::-webkit-slider-thumb:hover { transform: scale(1.12); }
.range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-2);
  border: 2px solid var(--glass-border-bright);
  box-shadow: var(--shadow-sm);
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--dur-normal) var(--ease-out-expo);
}
.modal-enter-from,
.modal-leave-to { opacity: 0; }
</style>
