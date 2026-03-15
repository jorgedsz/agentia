import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { paymentsAPI, usersAPI } from '../../services/api'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

const BILLING_CYCLES = ['monthly', 'quarterly', 'annual', 'lifetime']

export default function Payments() {
  const { user } = useAuth()
  const { t } = useLanguage()

  const [products, setProducts] = useState([])
  const [userProducts, setUserProducts] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState(user?.role === ROLES.OWNER ? 'products' : 'user-products')

  // Product modal
  const [productModal, setProductModal] = useState(null) // null | 'create' | product object
  const [productForm, setProductForm] = useState({ name: '', slug: '', description: '', monthlyPrice: '', quarterlyPrice: '', annualPrice: '', lifetimePrice: '', sortOrder: 0, isActive: true })
  const [productSaving, setProductSaving] = useState(false)

  // Assign modal
  const [assignModal, setAssignModal] = useState(null) // null | userId
  const [assignSelections, setAssignSelections] = useState({}) // { productId: { selected, billingCycle } }
  const [assignSaving, setAssignSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const [productsRes, userProductsRes] = await Promise.all([
        paymentsAPI.listProducts(),
        paymentsAPI.listUserProducts(),
      ])
      setProducts(productsRes.data)
      setUserProducts(userProductsRes.data)

      if (user?.role === ROLES.OWNER) {
        const usersRes = await usersAPI.getAll()
        setAllUsers(usersRes.data.users || [])
      } else if (user?.role === ROLES.AGENCY) {
        const usersRes = await usersAPI.getClients()
        setAllUsers(usersRes.data.clients || [])
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // ── Product CRUD ──

  const openCreateProduct = () => {
    setProductForm({ name: '', slug: '', description: '', monthlyPrice: '', quarterlyPrice: '', annualPrice: '', lifetimePrice: '', sortOrder: 0, isActive: true })
    setProductModal('create')
  }

  const openEditProduct = (product) => {
    setProductForm({
      name: product.name,
      slug: product.slug,
      description: product.description || '',
      monthlyPrice: product.monthlyPrice,
      quarterlyPrice: product.quarterlyPrice,
      annualPrice: product.annualPrice,
      lifetimePrice: product.lifetimePrice,
      sortOrder: product.sortOrder,
      isActive: product.isActive,
    })
    setProductModal(product)
  }

  const saveProduct = async () => {
    setProductSaving(true)
    setError('')
    try {
      if (productModal === 'create') {
        await paymentsAPI.createProduct(productForm)
        setSuccess(t('payments.productCreated'))
      } else {
        await paymentsAPI.updateProduct(productModal.id, productForm)
        setSuccess(t('payments.productUpdated'))
      }
      setProductModal(null)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save product')
    } finally {
      setProductSaving(false)
    }
  }

  const deleteProduct = async (product) => {
    if (!confirm(t('payments.confirmDeleteProduct'))) return
    try {
      await paymentsAPI.deleteProduct(product.id)
      setSuccess(t('payments.productDeleted'))
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete product')
    }
  }

  // ── Assign Products ──

  const openAssignModal = (userId) => {
    const existing = userProducts.filter(up => up.userId === userId)
    const selections = {}
    products.forEach(p => {
      const existingProduct = existing.find(ep => ep.productId === p.id)
      selections[p.id] = {
        selected: !!existingProduct,
        billingCycle: existingProduct?.billingCycle || 'monthly',
        wasExisting: !!existingProduct,
      }
    })
    setAssignSelections(selections)
    setAssignModal(userId)
  }

  const getAssignTotal = () => {
    const selected = Object.entries(assignSelections).filter(([, v]) => v.selected)
    const count = selected.length
    const discountPercent = count >= 3 ? 5 : 0

    let subtotal = 0
    selected.forEach(([productId, sel]) => {
      const product = products.find(p => p.id === parseInt(productId))
      if (product) {
        subtotal += getPriceForCycle(product, sel.billingCycle)
      }
    })
    const discountAmount = (subtotal * discountPercent) / 100
    return { count, subtotal, discountPercent, discountAmount, total: subtotal - discountAmount }
  }

  const saveAssignments = async () => {
    setAssignSaving(true)
    setError('')
    try {
      const toAssign = Object.entries(assignSelections)
        .filter(([, v]) => v.selected)
        .map(([productId, v]) => ({ productId: parseInt(productId), billingCycle: v.billingCycle }))

      // Remove products that were deselected
      const toRemove = Object.entries(assignSelections)
        .filter(([, v]) => !v.selected && v.wasExisting)
        .map(([productId]) => parseInt(productId))

      if (toAssign.length > 0) {
        await paymentsAPI.assignUserProducts(assignModal, { products: toAssign })
      }
      for (const productId of toRemove) {
        await paymentsAPI.removeUserProduct(assignModal, productId)
      }

      setSuccess(t('payments.productsAssigned'))
      setAssignModal(null)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign products')
    } finally {
      setAssignSaving(false)
    }
  }

  const removeUserProduct = async (userId, productId) => {
    if (!confirm(t('payments.confirmRemoveProduct'))) return
    try {
      await paymentsAPI.removeUserProduct(userId, productId)
      setSuccess(t('payments.productRemoved'))
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove product')
    }
  }

  // ── Helpers ──

  const getPriceForCycle = (product, cycle) => {
    switch (cycle) {
      case 'monthly': return product.monthlyPrice
      case 'quarterly': return product.quarterlyPrice
      case 'annual': return product.annualPrice
      case 'lifetime': return product.lifetimePrice
      default: return product.monthlyPrice
    }
  }

  const formatCurrency = (amount) => `$${parseFloat(amount || 0).toFixed(2)}`

  const getBillingCycleLabel = (cycle) => {
    switch (cycle) {
      case 'monthly': return t('payments.monthly')
      case 'quarterly': return t('payments.quarterly')
      case 'annual': return t('payments.annual')
      case 'lifetime': return t('payments.lifetime')
      default: return cycle
    }
  }

  const getBillingCycleSuffix = (cycle) => {
    switch (cycle) {
      case 'monthly': return t('payments.perMonth')
      case 'quarterly': return t('payments.perQuarter')
      case 'annual': return t('payments.perYear')
      case 'lifetime': return t('payments.perLifetime')
      default: return ''
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      case 'cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      case 'past_due': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return t('payments.statusActive')
      case 'cancelled': return t('payments.statusCancelled')
      case 'past_due': return t('payments.statusPastDue')
      default: return status
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // CLIENT shouldn't see this page (they see catalog in Settings)
  if (user?.role === ROLES.CLIENT) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t('payments.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('payments.clientRedirect')}</p>
      </div>
    )
  }

  // Group user products by user
  const userProductMap = {}
  userProducts.forEach(up => {
    if (!userProductMap[up.userId]) userProductMap[up.userId] = []
    userProductMap[up.userId].push(up)
  })

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t('payments.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('payments.subtitle')}</p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 p-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Tabs */}
      {user?.role === ROLES.OWNER && (
        <div className="flex gap-2 border-b border-gray-200 dark:border-dark-border">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'products' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
          >
            {t('payments.products')}
          </button>
          <button
            onClick={() => setActiveTab('user-products')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'user-products' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
          >
            {t('payments.userProducts')}
          </button>
        </div>
      )}

      {/* Products Tab (OWNER only) */}
      {activeTab === 'products' && user?.role === ROLES.OWNER && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('payments.products')}</h2>
            <button onClick={openCreateProduct} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors">
              {t('payments.createProduct')}
            </button>
          </div>

          {products.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('payments.noProducts')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-dark-border text-left text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">{t('payments.productName')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.monthlyPrice')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.quarterlyPrice')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.annualPrice')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.lifetimePrice')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.status')}</th>
                    <th className="px-4 py-3 font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id} className="border-b border-gray-100 dark:border-dark-border/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{product.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{product.slug}</div>
                        {product.description && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{product.description}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{formatCurrency(product.monthlyPrice)}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{formatCurrency(product.quarterlyPrice)}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{formatCurrency(product.annualPrice)}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{formatCurrency(product.lifetimePrice)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${product.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {product.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEditProduct(product)} className="text-primary-600 hover:text-primary-700 text-sm">{t('common.edit')}</button>
                          <button onClick={() => deleteProduct(product)} className="text-red-500 hover:text-red-600 text-sm">{t('common.delete')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* User Products Tab */}
      {activeTab === 'user-products' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('payments.userProducts')}</h2>
            {allUsers.length > 0 && (
              <select
                onChange={(e) => { if (e.target.value) openAssignModal(parseInt(e.target.value)); e.target.value = '' }}
                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors cursor-pointer appearance-none"
                defaultValue=""
              >
                <option value="" disabled>{t('payments.assignProducts')}</option>
                {allUsers.filter(u => u.role !== ROLES.OWNER).map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            )}
          </div>

          {userProducts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('payments.noUserProducts')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-dark-border text-left text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">{t('payments.user')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.productName')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.amount')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.billingCycle')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.discount')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.status')}</th>
                    <th className="px-4 py-3 font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {userProducts.map(up => (
                    <tr key={up.id} className="border-b border-gray-100 dark:border-dark-border/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{up.user?.name || up.user?.email}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{up.user?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{up.product?.name}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {formatCurrency(up.amount)}{getBillingCycleSuffix(up.billingCycle)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{getBillingCycleLabel(up.billingCycle)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {up.discountApplied > 0 ? `${up.discountApplied}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(up.status)}`}>
                          {getStatusLabel(up.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openAssignModal(up.userId)} className="text-primary-600 hover:text-primary-700 text-sm">{t('common.edit')}</button>
                          <button onClick={() => removeUserProduct(up.userId, up.productId)} className="text-red-500 hover:text-red-600 text-sm">{t('common.remove')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Product Modal */}
      {productModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-md">
            <div className="p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {productModal === 'create' ? t('payments.createProduct') : t('payments.editProduct')}
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.productName')}</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.slug')}</label>
                <input
                  type="text"
                  value={productForm.slug}
                  onChange={e => setProductForm(f => ({ ...f, slug: e.target.value }))}
                  placeholder="e.g. chatbots"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.description')}</label>
                <input
                  type="text"
                  value={productForm.description}
                  onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.monthlyPrice')} ($)</label>
                  <input type="number" step="0.01" value={productForm.monthlyPrice} onChange={e => setProductForm(f => ({ ...f, monthlyPrice: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.quarterlyPrice')} ($)</label>
                  <input type="number" step="0.01" value={productForm.quarterlyPrice} onChange={e => setProductForm(f => ({ ...f, quarterlyPrice: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.annualPrice')} ($)</label>
                  <input type="number" step="0.01" value={productForm.annualPrice} onChange={e => setProductForm(f => ({ ...f, annualPrice: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.lifetimePrice')} ($)</label>
                  <input type="number" step="0.01" value={productForm.lifetimePrice} onChange={e => setProductForm(f => ({ ...f, lifetimePrice: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.sortOrder')}</label>
                  <input type="number" value={productForm.sortOrder} onChange={e => setProductForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                </div>
                {productModal !== 'create' && (
                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={productForm.isActive} onChange={e => setProductForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                      {t('common.active')}
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-2">
              <button onClick={() => setProductModal(null)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg">
                {t('common.cancel')}
              </button>
              <button onClick={saveProduct} disabled={productSaving || !productForm.name || !productForm.slug}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {productSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Products Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-lg">
            <div className="p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('payments.assignProducts')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {allUsers.find(u => u.id === assignModal)?.name || allUsers.find(u => u.id === assignModal)?.email}
              </p>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {products.filter(p => p.isActive).map(product => {
                const sel = assignSelections[product.id] || { selected: false, billingCycle: 'monthly' }
                return (
                  <div key={product.id} className={`p-3 rounded-lg border transition-colors ${sel.selected ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/10' : 'border-gray-200 dark:border-dark-border'}`}>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={sel.selected}
                          onChange={e => setAssignSelections(prev => ({ ...prev, [product.id]: { ...prev[product.id], selected: e.target.checked } }))}
                          className="rounded"
                        />
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white text-sm">{product.name}</div>
                          {product.description && <div className="text-xs text-gray-500 dark:text-gray-400">{product.description}</div>}
                        </div>
                      </label>
                      {sel.selected && (
                        <select
                          value={sel.billingCycle}
                          onChange={e => setAssignSelections(prev => ({ ...prev, [product.id]: { ...prev[product.id], billingCycle: e.target.value } }))}
                          className="px-2 py-1 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-xs"
                        >
                          {BILLING_CYCLES.map(c => (
                            <option key={c} value={c}>{getBillingCycleLabel(c)} — {formatCurrency(getPriceForCycle(product, c))}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Order Summary */}
            {(() => {
              const { count, subtotal, discountPercent, discountAmount, total } = getAssignTotal()
              return (
                <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{t('payments.subtotal')} ({count} {t('payments.products').toLowerCase()})</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex justify-between text-green-600 dark:text-green-400">
                        <span>{t('payments.bundleDiscount')} ({discountPercent}%)</span>
                        <span>-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-dark-border">
                      <span>{t('payments.total')}</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                    {count >= 3 && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">{t('payments.bundleDiscountNote')}</p>
                    )}
                  </div>
                </div>
              )
            })()}

            <div className="p-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-2">
              <button onClick={() => setAssignModal(null)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg">
                {t('common.cancel')}
              </button>
              <button onClick={saveAssignments} disabled={assignSaving}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {assignSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
