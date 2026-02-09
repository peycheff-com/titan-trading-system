import { getApiBaseUrl } from '@/lib/api-config';
import { OperatorRole, buildPermissionMatrix, PermissionMatrix } from '@titan/shared';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  operatorId: string | null;
  roles: OperatorRole[];
  permissions: PermissionMatrix[];
  login: (operatorId: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('titan_jwt'));
  const [operatorId, setOperatorId] = useState<string | null>(localStorage.getItem('titan_operator_id'));
  const [isLoading, setIsLoading] = useState(true);
  const [roles, setRoles] = useState<OperatorRole[]>([]);
  const [permissions, setPermissions] = useState<PermissionMatrix[]>([]);

  useEffect(() => {
    // Validate token on mount
    const checkAuth = async () => {
      if (token && operatorId) {
        try {
            // In a real app we'd validate the token with the backend here.
            // For now, we'll assume it's valid if present, but we need to fetch roles.
            // Mocking roles for now since we don't have a /me endpoint yet
            const mockRoles: OperatorRole[] = ['operator']; // Default role
            setRoles(mockRoles);
            setPermissions(buildPermissionMatrix());
            setIsAuthenticated(true);
        } catch (e) {
            console.error(e);
            logout();
        }
      }
      setIsLoading(false);
    };
    checkAuth();
  }, [token, operatorId]);

  const login = async (opId: string, pass: string): Promise<boolean> => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: opId, password: pass }),
      });

      if (res.ok) {
        const data = await res.json();
        const jwt = data.token;
        localStorage.setItem('titan_jwt', jwt);
        localStorage.setItem('titan_operator_id', opId);
        setToken(jwt);
        setOperatorId(opId);
        
        // Decode roles from token or fetch (mocking for now)
        const userRoles: OperatorRole[] = data.roles || ['operator'];
        setRoles(userRoles);
        setPermissions(buildPermissionMatrix());
        
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Login error', err);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('titan_jwt');
    localStorage.removeItem('titan_operator_id');
    setToken(null);
    setOperatorId(null);
    setRoles([]);
    setPermissions([]);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, operatorId, roles, permissions, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
