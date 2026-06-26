<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  label?: string
  message?: string
  initialValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  /** Confirm-only mode: hide the text input (use for delete confirmations). */
  hideInput?: boolean
}>(), {
  title: '输入',
  label: '',
  message: '',
  initialValue: '',
  placeholder: '',
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
  hideInput: false
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  confirm: [value: string]
  cancel: []
}>()

const value = ref(props.initialValue)
const inputEl = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      value.value = props.initialValue
      nextTick(() => inputEl.value?.focus())
      document.addEventListener('keydown', onKey)
    } else {
      document.removeEventListener('keydown', onKey)
    }
  }
)

onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel()
}

function close() {
  emit('update:modelValue', false)
}
function confirm() {
  if (!props.hideInput && !value.value.trim()) return
  emit('confirm', props.hideInput ? '' : value.value.trim())
  close()
}
function cancel() {
  emit('cancel')
  close()
}
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition name="modal">
      <div v-if="modelValue" class="modal" role="dialog" aria-modal="true" @click.self="cancel">
        <div class="modal__panel glass glass--strong anim-scale-in">
          <h3 class="modal__title">{{ title }}</h3>
          <label v-if="label" class="modal__label">{{ label }}</label>
          <p v-if="message" class="modal__message">{{ message }}</p>
          <input
            v-if="!hideInput"
            ref="inputEl"
            v-model="value"
            class="glass-input modal__input"
            :placeholder="placeholder"
            @keydown.enter="confirm"
          />
          <div class="modal__actions">
            <button class="glass-btn" @click="cancel">{{ cancelText }}</button>
            <button
              class="glass-btn"
              :class="danger ? 'glass-btn--danger' : 'glass-btn--primary'"
              :disabled="!hideInput && !value.trim()"
              @click="confirm"
            >
              {{ confirmText }}
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
  gap: var(--space-3);
}
.modal__title {
  font-size: var(--text-lg);
  font-weight: 700;
}
.modal__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.modal__message {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.5;
}
.modal__input {
  margin-bottom: var(--space-2);
}
.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--dur-normal) var(--ease-out-expo);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
