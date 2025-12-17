import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { Chart as ChartJS, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { Line } from 'react-chartjs-2'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from './firebase'
import './App.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const STATEMENT_OF_INTENT = `We believe in data-driven transparency for public decision-making, responsible supply chain stewardship, and inclusive economic growth. By combining open data and citizen input, we will advocate for accountable retail distribution, predictable warehouse logistics, and equitable access to resources for every community we serve. If you support this statement, please sign in or sign up!`

const DATA_URL = new URL(`${import.meta.env.BASE_URL || ''}Warehouse_and_Retail_Sales.csv`, window.location.origin).toString()

const formatCurrency = (value) =>
  Number.isFinite(value) ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '$0'

function App() {
  const [rows, setRows] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')

  const [selectedYear, setSelectedYear] = useState('latest')
  const [selectedType, setSelectedType] = useState('all')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('all')

  const [authUser, setAuthUser] = useState(null)
  const [authMode, setAuthMode] = useState('register')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [supportMessage, setSupportMessage] = useState('')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })

  useEffect(() => {
    setLoadingData(true)
    Papa.parse(DATA_URL, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      worker: true,
      complete: ({ data, errors }) => {
        if (errors && errors.length) {
          setDataError(errors[0].message || 'Unable to read dataset')
        }
        const cleaned = data
          .filter((row) => row.YEAR && row.MONTH)
          .map((row) => ({
            year: Number(row.YEAR),
            month: Number(row.MONTH),
            supplier: row.SUPPLIER || 'Unknown supplier',
            itemType: row['ITEM TYPE'] || 'Unspecified',
            retailSales: Number(row['RETAIL SALES']) || 0,
            retailTransfers: Number(row['RETAIL TRANSFERS']) || 0,
            warehouseSales: Number(row['WAREHOUSE SALES']) || 0,
          }))
        setRows(cleaned)
        setLoadingData(false)
      },
      error: (err) => {
        setDataError(err.message || 'Unable to read dataset')
        setLoadingData(false)
      },
    })
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return undefined
    const unsub = onAuthStateChanged(auth, (user) => setAuthUser(user))
    return () => unsub && unsub()
  }, [])

  const availableYears = useMemo(() => {
    const uniqueYears = new Set(rows.map((row) => row.year))
    return [...uniqueYears].sort((a, b) => a - b)
  }, [rows])

  const resolvedYear = useMemo(() => {
    if (selectedYear === 'all') return null
    if (selectedYear === 'latest' && availableYears.length) return availableYears[availableYears.length - 1]
    return Number(selectedYear)
  }, [availableYears, selectedYear])

  const availableTypes = useMemo(() => {
    const uniqueTypes = new Set(rows.map((row) => row.itemType))
    return [...uniqueTypes].sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    const supplierFilter = supplierQuery.trim().toLowerCase()
    return rows.filter((row) => {
      const matchYear = resolvedYear ? row.year === resolvedYear : true
      const matchType = selectedType === 'all' ? true : row.itemType === selectedType
      const matchMonth = selectedMonth === 'all' ? true : row.month === Number(selectedMonth)
      const matchSupplier = supplierFilter ? row.supplier.toLowerCase().includes(supplierFilter) : true
      return matchYear && matchType && matchMonth && matchSupplier
    })
  }, [resolvedYear, rows, selectedType, selectedMonth, supplierQuery])

  const monthlyStats = useMemo(() => {
    const base = MONTH_LABELS.map((label, index) => ({
      label,
      retailSales: 0,
      retailTransfers: 0,
      warehouseSales: 0,
      month: index + 1,
    }))

    filteredRows.forEach((row) => {
      const monthIndex = row.month - 1
      if (monthIndex >= 0 && monthIndex < 12) {
        base[monthIndex].retailSales += row.retailSales
        base[monthIndex].retailTransfers += row.retailTransfers
        base[monthIndex].warehouseSales += row.warehouseSales
      }
    })
    return base
  }, [filteredRows])

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => ({
          retailSales: acc.retailSales + row.retailSales,
          retailTransfers: acc.retailTransfers + row.retailTransfers,
          warehouseSales: acc.warehouseSales + row.warehouseSales,
        }),
        { retailSales: 0, retailTransfers: 0, warehouseSales: 0 },
      ),
    [filteredRows],
  )

  const overview = useMemo(() => {
    if (!rows.length) return null
    const years = availableYears
    const suppliers = new Set(rows.map((row) => row.supplier)).size
    const types = new Set(rows.map((row) => row.itemType)).size
    return {
      totalRows: rows.length,
      yearRange:
        years.length && years[0] !== years[years.length - 1]
          ? `${years[0]} – ${years[years.length - 1]}`
          : years[0] || '',
      suppliers,
      types,
    }
  }, [availableYears, rows])

  const topSuppliers = useMemo(() => {
    const supplierTotals = new Map()
    filteredRows.forEach((row) => {
      const current = supplierTotals.get(row.supplier) || 0
      supplierTotals.set(row.supplier, current + row.retailSales + row.warehouseSales)
    })
    return [...supplierTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([supplier, value]) => ({ supplier, value }))
  }, [filteredRows])

  const chartData = useMemo(
    () => ({
      labels: MONTH_LABELS,
      datasets: [
        {
          label: 'Retail Sales',
          data: monthlyStats.map((entry) => entry.retailSales),
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.15)',
          tension: 0.35,
          fill: true,
        },
        {
          label: 'Warehouse Sales',
          data: monthlyStats.map((entry) => entry.warehouseSales),
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.14)',
          tension: 0.35,
          fill: true,
        },
        {
          label: 'Retail Transfers',
          data: monthlyStats.map((entry) => entry.retailTransfers),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.14)',
          tension: 0.35,
          fill: true,
        },
      ],
    }),
    [monthlyStats],
  )

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
        },
      },
    },
    scales: {
      y: {
        ticks: { callback: (value) => `$${Number(value).toLocaleString()}` },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
      x: { grid: { display: false } },
    },
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')
    setSupportMessage('')
    if (!isFirebaseConfigured || !auth) {
      setAuthError('Add your VITE_FIREBASE_* environment variables to enable registration.')
      return
    }

    if (!authForm.email || !authForm.password) {
      setAuthError('Email and password are required.')
      return
    }

    try {
      setAuthLoading(true)
      if (authMode === 'register') {
        const credentials = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password)
        if (authForm.name) {
          await updateProfile(credentials.user, { displayName: authForm.name })
        }
        setSupportMessage('Thanks for registering your support. You are on the record for our Statement of Intent.')
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password)
        setSupportMessage('Welcome back—your support is recorded.')
      }
      setAuthForm((prev) => ({ ...prev, password: '' }))
    } catch (error) {
      setAuthError(error.message || 'Unable to complete the request.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    if (!auth) return
    await signOut(auth)
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Warehouse & Retail Transparency Portal</p>
          <h1>
            Monthly intelligence on retail and warehouse flows, with a voter-ready Statement of Intent.
          </h1>
          <p className="lede">
            Explore sales, transfers, and warehouse throughput by month. Segment by year, product type, or supplier,
            then register your support via secure Firebase authentication.
          </p>
        </div>
        <div className="hero-stat">
          <div className="stat-block">
            <p>Dataset rows</p>
            <h2>{rows.length ? rows.length.toLocaleString() : 'Loading…'}</h2>
          </div>
          <div className="stat-block alt">
            <p>Filters active</p>
            <h2>
              {resolvedYear ? `${resolvedYear}` : 'All years'}
              {selectedType !== 'all' ? ` · ${selectedType}` : ''}
            </h2>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Segment the dataset</p>
              <h3>Filter by year, item type, or supplier</h3>
            </div>
            {overview && (
              <div className="pill">
                {overview.yearRange && <span>{overview.yearRange}</span>}
                <span>{overview.suppliers.toLocaleString()} suppliers</span>
                <span>{overview.types.toLocaleString()} product types</span>
              </div>
            )}
          </div>

          <div className="filter-grid">
            <label className="field">
              <span>Year</span>
              <select
                value={selectedYear}
                onChange={(event) => {
                  const value = event.target.value
                  setSelectedYear(value === 'all' || value === 'latest' ? value : Number(value))
                }}
              >
                <option value="latest">Latest year</option>
                <option value="all">All years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Month</span>
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value === 'all' ? 'all' : Number(event.target.value))}
              >
                <option value="all">All months</option>
                {MONTH_LABELS.map((label, idx) => (
                  <option key={label} value={idx + 1}>
                    {idx + 1} — {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Item type</span>
              <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
                <option value="all">All types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Supplier search</span>
              <input
                type="search"
                placeholder="Start typing a supplier..."
                value={supplierQuery}
                onChange={(event) => setSupplierQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <p>Retail sales</p>
              <h4>{formatCurrency(totals.retailSales)}</h4>
              <small>Sum of retail sales for the current segment</small>
            </div>
            <div className="stat-card">
              <p>Warehouse sales</p>
              <h4>{formatCurrency(totals.warehouseSales)}</h4>
              <small>Warehouse throughput for the current segment</small>
            </div>
            <div className="stat-card">
              <p>Retail transfers</p>
              <h4>{formatCurrency(totals.retailTransfers)}</h4>
              <small>Transfers recorded for the selected slice</small>
            </div>
            <div className="stat-card">
              <p>Matching rows</p>
              <h4>{filteredRows.length.toLocaleString()}</h4>
              <small>Rows that match the filters above</small>
            </div>
          </div>
        </section>

        <section className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Monthly view</p>
              <h3>Sales, transfers, and warehouse activity per month</h3>
            </div>
            <span className="pill">Auto-refreshes on filter changes</span>
          </div>
          <div className="chart-area">
            {loadingData && <p className="muted">Loading dataset…</p>}
            {dataError && <p className="error">{dataError}</p>}
            {!loadingData && !filteredRows.length && <p className="muted">No data matches the current filters.</p>}
            {!loadingData && filteredRows.length > 0 && (
              <Line data={chartData} options={chartOptions} aria-label="Monthly sales chart" />
            )}
          </div>
          <div className="top-suppliers">
            <h4>Top suppliers in this segment</h4>
            <div className="pill-row">
              {topSuppliers.length === 0 && <span className="pill muted">No suppliers match the filters.</span>}
              {topSuppliers.map((entry) => (
                <span className="pill" key={entry.supplier}>
                  {entry.supplier} · {formatCurrency(entry.value)}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="panel support-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Statement of Intent</p>
              <h3>Register your support</h3>
              <p className="lede small">{STATEMENT_OF_INTENT}</p>
            </div>
            {!isFirebaseConfigured && (
              <div className="pill-row">
                <span className="pill warning">Firebase config needed</span>
              </div>
            )}
          </div>

          <div className="support-grid">
            <div className="support-card">
              <h4>{authMode === 'register' ? 'Create your supporter record' : 'Access your supporter record'}</h4>
              <form className="form-grid" onSubmit={handleAuthSubmit}>
                {authMode === 'register' && (
                  <label className="field">
                    <span>Full name</span>
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      value={authForm.name}
                      onChange={(event) => setAuthForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </label>
                )}
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={authForm.email}
                    onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authForm.password}
                    onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                </label>
                {authError && <p className="error">{authError}</p>}
                {supportMessage && <p className="success">{supportMessage}</p>}
                <div className="form-actions">
                  <button type="submit" disabled={authLoading}>
                    {authLoading ? 'Working…' : authMode === 'register' ? 'Register support' : 'Sign in'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setAuthMode((prev) => (prev === 'register' ? 'signin' : 'register'))
                      setAuthError('')
                      setSupportMessage('')
                    }}
                  >
                    {authMode === 'register' ? 'Already registered? Sign in' : 'New? Create an account'}
                  </button>
                </div>
              </form>
            </div>

            <div className="support-card secondary">
              <div className="support-header">
                <div>
                  <p className="eyebrow">Your status</p>
                  <h4>{authUser ? 'Supporter on file' : 'Not signed in'}</h4>
                </div>
                {authUser && (
                  <button type="button" className="ghost small" onClick={handleSignOut}>
                    Sign out
                  </button>
                )}
              </div>
              {authUser ? (
                <ul className="status-list">
                  <li>
                    <span>Email</span>
                    <strong>{authUser.email}</strong>
                  </li>
                  {authUser.displayName && (
                    <li>
                      <span>Name</span>
                      <strong>{authUser.displayName}</strong>
                    </li>
                  )}
                  <li>
                    <span>Support recorded</span>
                    <strong>Yes — thank you.</strong>
                  </li>
                </ul>
              ) : (
                <p className="muted">
                  Register or sign in to add your name in support of the Statement of Intent. Authentication uses your
                  Firebase project keys (VITE_FIREBASE_*).
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
