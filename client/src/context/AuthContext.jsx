import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI, teamMembersAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [originalUser, setOriginalUser] = useState(null)
  const [isTeamMember, setIsTeamMember] = useState(false)
  const [teamMember, setTeamMember] = useState(null)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const response = await authAPI.getMe()
      setUser(response.data.user)

      // Handle team member state
      if (response.data.isTeamMember) {
        setIsTeamMember(true)
        setTeamMember(response.data.teamMember)
      } else {
        setIsTeamMember(false)
        setTeamMember(null)
      }

      // Handle impersonation state
      if (response.data.isImpersonating) {
        setIsImpersonating(true)
        setOriginalUser(response.data.originalUser)
      } else {
        setIsImpersonating(false)
        setOriginalUser(null)
      }
    } catch (error) {
      localStorage.removeItem('token')
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password) => {
    // Try regular user login first
    try {
      const response = await authAPI.login({ email, password })
      const { token, user } = response.data
      localStorage.setItem('token', token)
      setUser(user)
      setIsImpersonating(false)
      setOriginalUser(null)
      setIsTeamMember(false)
      setTeamMember(null)
      return user
    } catch (error) {
      // If regular login fails, try team member login
      if (error.response?.status === 401) {
        try {
          const teamResponse = await teamMembersAPI.login({ email, password })
          const { token, user } = teamResponse.data
          localStorage.setItem('token', token)
          setUser(user.account)
          setIsTeamMember(true)
          setTeamMember({
            id: user.id,
            email: user.email,
            name: user.name,
            teamRole: user.teamRole
          })
          setIsImpersonating(false)
          setOriginalUser(null)
          return user
        } catch (teamError) {
          // Both failed, throw original error
          throw error
        }
      }
      throw error
    }
  }

  const register = async (email, password, name) => {
    const response = await authAPI.register({ email, password, name })
    const { token, user } = response.data
    localStorage.setItem('token', token)
    setUser(user)
    setIsImpersonating(false)
    setOriginalUser(null)
    return user
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    setIsImpersonating(false)
    setOriginalUser(null)
    setIsTeamMember(false)
    setTeamMember(null)
  }

  const switchAccount = async (targetUserId) => {
    const response = await authAPI.switchAccount(targetUserId)
    const { token, user, originalUser } = response.data
    localStorage.setItem('token', token)
    setUser(user)
    setIsImpersonating(true)
    setOriginalUser(originalUser)
    return user
  }

  const switchBack = async () => {
    const response = await authAPI.switchBack()
    const { token, user } = response.data
    localStorage.setItem('token', token)
    setUser(user)
    setIsImpersonating(false)
    setOriginalUser(null)
    return user
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      register,
      logout,
      isImpersonating,
      originalUser,
      switchAccount,
      switchBack,
      isTeamMember,
      teamMember
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
