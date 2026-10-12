// The to-do list's items. Held outside React so they outlive the widget:
// closing and reopening it, or the agent adding items while it is closed,
// all act on the same list. In memory only -- a reload starts over, like
// the conversation does.
// `fresh` marks an item as just added, for the widget's highlight; it
// clears itself shortly after (see addTodos).
export type Todo = { id: number; text: string; done: boolean; fresh: boolean }

const FRESH_MS = 2500

let nextId = 0
const make = (text: string): Todo => ({ id: nextId++, text, done: false, fresh: false })

let todos: readonly Todo[] = [make('Book flights to Oslo'), make('Call mum')]
const listeners = new Set<() => void>()

function set(next: readonly Todo[]) {
  todos = next
  listeners.forEach((listener) => listener())
}

export function subscribeTodos(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTodos() {
  return todos
}

export function addTodos(texts: string[]) {
  const cleaned = texts.map((text) => text.trim()).filter(Boolean)
  if (cleaned.length === 0) return

  const added = cleaned.map((text) => ({ ...make(text), fresh: true }))
  set([...todos, ...added])
  const ids = new Set(added.map((todo) => todo.id))
  setTimeout(() => {
    set(todos.map((todo) => (ids.has(todo.id) ? { ...todo, fresh: false } : todo)))
  }, FRESH_MS)
}

export function toggleTodo(id: number) {
  set(todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)))
}

export function removeTodo(id: number) {
  set(todos.filter((todo) => todo.id !== id))
}
