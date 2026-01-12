import { useState, useEffect, useCallback } from 'react'
import HyperDX from '@hyperdx/browser'

interface Task {
  id: string
  title: string
  description: string
  completed: boolean
  createdAt: string
}

type DatabaseType = 'memory' | 'mongodb' | 'redis' | 'postgres'

const API_BASE = 'http://localhost:3000'

const DB_ROUTES: Record<DatabaseType, string> = {
  memory: '/tasks',
  mongodb: '/mongo/tasks',
  redis: '/redis/tasks',
  postgres: '/postgres/tasks',
}

const DB_LABELS: Record<DatabaseType, string> = {
  memory: 'In-Memory',
  mongodb: 'MongoDB',
  redis: 'Redis',
  postgres: 'PostgreSQL',
}

function App() {
  const [database, setDatabase] = useState<DatabaseType>('memory')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newTask, setNewTask] = useState({ title: '', description: '' })
  const [logs, setLogs] = useState<string[]>([])

  const apiPath = `${API_BASE}${DB_ROUTES[database]}`

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)])

    // Also send to HyperDX as a custom action
    HyperDX.addAction(message, { timestamp, database })
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    addLog(`📡 Fetching tasks from ${DB_LABELS[database]}...`)

    try {
      const res = await fetch(apiPath)
      if (!res.ok) throw new Error('Failed to fetch tasks')
      const data = await res.json()
      setTasks(data)
      addLog(`✅ Fetched ${data.length} tasks from ${DB_LABELS[database]}`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      addLog(`❌ Error: ${err}`)

      // Record error in HyperDX
      HyperDX.recordException(err instanceof Error ? err : new Error(errorMsg), {
        operation: 'fetchTasks',
        database,
      })
    } finally {
      setLoading(false)
    }
  }, [apiPath, database])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim()) return

    addLog(`📝 Creating task in ${DB_LABELS[database]}: ${newTask.title}`)

    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      })

      if (!res.ok) throw new Error('Failed to create task')

      const task = await res.json()
      setTasks(prev => [...prev, task])
      setNewTask({ title: '', description: '' })
      addLog(`✅ Created task: ${task.id}`)
    } catch (err) {
      addLog(`❌ Error creating task: ${err}`)
      HyperDX.recordException(err instanceof Error ? err : new Error('Create task failed'))
    }
  }

  const toggleTask = async (task: Task) => {
    addLog(`🔄 Toggling task in ${DB_LABELS[database]}: ${task.id}`)

    try {
      const res = await fetch(`${apiPath}/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed }),
      })

      if (!res.ok) throw new Error('Failed to update task')

      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
      addLog(`✅ Task ${task.completed ? 'uncompleted' : 'completed'}`)
    } catch (err) {
      addLog(`❌ Error updating task: ${err}`)
      HyperDX.recordException(err instanceof Error ? err : new Error('Update task failed'))
    }
  }

  const deleteTask = async (id: string) => {
    addLog(`🗑️ Deleting task from ${DB_LABELS[database]}: ${id}`)

    try {
      const res = await fetch(`${apiPath}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete task')

      setTasks(prev => prev.filter(t => t.id !== id))
      addLog(`✅ Deleted task: ${id}`)
    } catch (err) {
      addLog(`❌ Error deleting task: ${err}`)
      HyperDX.recordException(err instanceof Error ? err : new Error('Delete task failed'))
    }
  }

  const testSlowOperation = async () => {
    addLog('🐢 Starting slow operation...')

    try {
      const res = await fetch(`${API_BASE}/tasks/slow`)
      const data = await res.json()
      addLog(`✅ Slow operation completed in ${data.duration}ms`)
    } catch (err) {
      addLog(`❌ Error: ${err}`)
    }
  }

  const testError = async () => {
    addLog('💥 Triggering error...')

    try {
      const res = await fetch(`${API_BASE}/tasks/error`)
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`)
      }
      addLog('❌ Expected error but got success?')
    } catch (err) {
      addLog(`✅ Error caught (expected): ${err}`)
      // Record the intentional error for observability demo
      HyperDX.recordException(err instanceof Error ? err : new Error('Simulated error'), {
        intentional: 'true',
        operation: 'testError',
      })
    }
  }

  const checkHealth = async () => {
    addLog('🏥 Checking health...')

    try {
      const res = await fetch(`${API_BASE}/health`)
      const data = await res.json()
      addLog(`✅ Health: ${data.status}, Uptime: ${data.uptime.toFixed(2)}s`)
    } catch (err) {
      addLog(`❌ Health check failed: ${err}`)
    }
  }

  // Test frontend error (for session replay)
  const triggerFrontendError = () => {
    addLog('💥 Triggering frontend error...')
    try {
      // Intentionally cause an error
      throw new Error('Intentional frontend error for testing session replay')
    } catch (err) {
      addLog(`✅ Frontend error caught`)
      HyperDX.recordException(err as Error, {
        component: 'App',
        action: 'triggerFrontendError',
      })
    }
  }

  const handleDatabaseChange = (db: DatabaseType) => {
    setDatabase(db)
    setTasks([]) // Clear tasks when switching database
    addLog(`🔀 Switched to ${DB_LABELS[db]}`)
  }

  return (
    <div className="container">
      <header>
        <h1>🔭 ClickStack Demo</h1>
        <p>NestJS + React + OpenTelemetry → ClickStack</p>
      </header>

      {/* Database Selector Tabs */}
      <div className="database-tabs">
        {(Object.keys(DB_ROUTES) as DatabaseType[]).map((db) => (
          <button
            key={db}
            className={`db-tab ${database === db ? 'active' : ''}`}
            onClick={() => handleDatabaseChange(db)}
          >
            {DB_LABELS[db]}
          </button>
        ))}
      </div>

      <div className="grid">
        <section className="card">
          <h2>📋 Task Manager <span className="db-badge">{DB_LABELS[database]}</span></h2>

          <form onSubmit={createTask} className="form">
            <input
              type="text"
              placeholder="Task title"
              value={newTask.title}
              onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Description"
              value={newTask.description}
              onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
            />
            <button type="submit">Add Task</button>
          </form>

          {loading && <p className="loading">Loading...</p>}
          {error && <p className="error">Error: {error}</p>}

          <ul className="task-list">
            {tasks.map(task => (
              <li key={task.id} className={task.completed ? 'completed' : ''}>
                <label>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTask(task)}
                  />
                  <span className="task-title">{task.title}</span>
                </label>
                <span className="task-desc">{task.description}</span>
                <button className="delete-btn" onClick={() => deleteTask(task.id)}>×</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>🧪 Test Observability</h2>
          <p>Generate traces and logs for ClickStack</p>

          <div className="button-group">
            <button onClick={fetchTasks}>🔄 Refresh Tasks</button>
            <button onClick={checkHealth}>🏥 Health Check</button>
            <button onClick={testSlowOperation}>🐢 Slow Operation</button>
            <button onClick={testError} className="danger">💥 Backend Error</button>
            <button onClick={triggerFrontendError} className="danger">🖥️ Frontend Error</button>
          </div>

          <div className="info-box">
            <h3>ClickStack</h3>
            <ul>
              <li>Search → View logs</li>
              <li>Traces → See distributed traces</li>
              <li>Dashboards → Create visualizations</li>
            </ul>
          </div>
        </section>

        <section className="card logs">
          <h2>📜 Activity Log</h2>
          <div className="log-list">
            {logs.length === 0 ? (
              <p className="empty">No activity yet</p>
            ) : (
              logs.map((log, i) => <div key={i} className="log-entry">{log}</div>)
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
