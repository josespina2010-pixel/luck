import { useCallback, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { apiRequest } from './lib/api.ts';
import type {
  Branch,
  DashboardSummary,
  DbUser,
  PaginatedParcels,
  ParcelStatus,
  UserRole,
} from './types/logistics.ts';
import {
  DecisionBanner,
  type OperationDecision,
} from './components/DecisionBanner.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import {
  ParcelsView,
  type ParcelFiltersState,
} from './components/ParcelsView.tsx';
import { BranchesView } from './components/BranchesView.tsx';
import { VerificationView } from './components/VerificationView.tsx';
import { UsersView } from './components/UsersView.tsx';

type ActiveTab =
  | 'dashboard'
  | 'parcels'
  | 'branches'
  | 'verification'
  | 'users';

const INITIAL_FILTERS: ParcelFiltersState = {
  search: '',
  branchId: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
  pageSize: 8,
};

const TAB_LABELS: Record<ActiveTab, string> = {
  dashboard: 'Panel de control',
  parcels: 'Encomiendas',
  branches: 'Sucursales',
  verification: 'Pruebas obligatorias',
  users: 'Usuarios y roles',
};

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [previewConsulta, setPreviewConsulta] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [decision, setDecision] = useState<OperationDecision | null>(null);

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const [filters, setFilters] = useState<ParcelFiltersState>(INITIAL_FILTERS);
  const [parcelsData, setParcelsData] = useState<PaginatedParcels | null>(null);
  const [parcelsLoading, setParcelsLoading] = useState(false);

  const [usersList, setUsersList] = useState<DbUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const effectiveRole: UserRole =
    dbUser?.role === 'admin' && !previewConsulta ? 'admin' : 'consulta';

  const recordDecision = useCallback(
    (res: {
      accepted: boolean;
      code: string;
      rule: string;
      message: string;
      statusCode?: number;
    }) => {
      setDecision({
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        accepted: res.accepted,
        code: res.code,
        rule: res.rule,
        message: res.message,
        statusCode: res.statusCode,
      });
    },
    []
  );

  // Sync Firebase Auth session
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);
      if (!user) {
        setDbUser(null);
        setAuthReady(true);
        return;
      }
      try {
        const res = await apiRequest<DbUser>('/api/me');
        if (res.accepted && res.data) {
          setDbUser(res.data);
        } else {
          setAuthError(res.message);
        }
      } catch {
        setAuthError('No se pudo verificar el perfil de usuario en el servidor.');
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!firebaseUser) return;
    setDashboardLoading(true);
    try {
      const res = await apiRequest<DashboardSummary>('/api/dashboard');
      if (res.accepted && res.data) {
        setDashboard(res.data);
      }
    } finally {
      setDashboardLoading(false);
    }
  }, [firebaseUser]);

  const loadBranches = useCallback(async () => {
    if (!firebaseUser) return;
    setBranchesLoading(true);
    try {
      const suffix = effectiveRole === 'consulta' ? '?viewAs=consulta' : '';
      const res = await apiRequest<Branch[]>(`/api/branches${suffix}`);
      if (res.accepted && res.data) {
        setBranches(res.data);
      }
    } finally {
      setBranchesLoading(false);
    }
  }, [firebaseUser, effectiveRole]);

  const loadParcels = useCallback(async () => {
    if (!firebaseUser) return;
    setParcelsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.search.trim()) qs.set('search', filters.search.trim());
      if (filters.branchId) qs.set('branchId', filters.branchId);
      if (filters.status) qs.set('status', filters.status);
      if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) qs.set('dateTo', filters.dateTo);
      qs.set('sortBy', filters.sortBy);
      qs.set('sortOrder', filters.sortOrder);
      qs.set('page', String(filters.page));
      qs.set('pageSize', String(filters.pageSize));
      if (effectiveRole === 'consulta') qs.set('viewAs', 'consulta');

      const res = await apiRequest<PaginatedParcels>(
        `/api/parcels?${qs.toString()}`
      );
      if (res.accepted && res.data) {
        setParcelsData(res.data);
      }
    } finally {
      setParcelsLoading(false);
    }
  }, [firebaseUser, filters, effectiveRole]);

  const loadUsers = useCallback(async () => {
    if (!firebaseUser || effectiveRole !== 'admin') return;
    setUsersLoading(true);
    try {
      const res = await apiRequest<DbUser[]>('/api/users');
      if (res.accepted && res.data) {
        setUsersList(res.data);
      }
    } finally {
      setUsersLoading(false);
    }
  }, [firebaseUser, effectiveRole]);

  const refreshAll = useCallback(() => {
    loadDashboard();
    loadBranches();
    loadParcels();
    if (effectiveRole === 'admin') {
      loadUsers();
    }
  }, [loadDashboard, loadBranches, loadParcels, loadUsers, effectiveRole]);

  useEffect(() => {
    if (firebaseUser && dbUser) {
      loadDashboard();
      loadBranches();
    }
  }, [firebaseUser, dbUser, loadDashboard, loadBranches]);

  useEffect(() => {
    if (firebaseUser && dbUser) {
      loadParcels();
    }
  }, [firebaseUser, dbUser, loadParcels]);

  useEffect(() => {
    if (firebaseUser && dbUser && effectiveRole === 'admin' && activeTab === 'users') {
      loadUsers();
    }
  }, [firebaseUser, dbUser, effectiveRole, activeTab, loadUsers]);

  // If switching into Consulta preview while on an admin-only tab, move back to dashboard
  useEffect(() => {
    if (
      effectiveRole === 'consulta' &&
      (activeTab === 'verification' || activeTab === 'users')
    ) {
      setActiveTab('dashboard');
    }
  }, [effectiveRole, activeTab]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo completar el inicio de sesión con Google.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setDbUser(null);
    setDashboard(null);
    setParcelsData(null);
    setBranches([]);
    setDecision(null);
    setPreviewConsulta(false);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Verificando sesión...</div>
      </div>
    );
  }

  if (!firebaseUser || !dbUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-5 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="lg:col-span-3 p-8 sm:p-10 space-y-6">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-blue-700 tracking-tight">
                RutaControl Encomiendas
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight text-balance">
                Control de paquetes y recorrido operativo de estados
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Plataforma centralizada para administrar sucursales, registrar encomiendas, validar la secuencia recibida → en tránsito → entregada y consultar trazabilidad autorizada según perfil.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-lg border border-slate-200 p-4 space-y-1.5">
                <div className="text-sm font-semibold text-slate-900">
                  Perfil Administrador
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Alta, modificación y baja de sucursales y encomiendas, registro de eventos, pruebas obligatorias y control de roles.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4 space-y-1.5">
                <div className="text-sm font-semibold text-slate-900">
                  Perfil Usuario de Consulta
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Acceso exclusivo de lectura a métricas, filtros combinados y recorrido autorizado sin exposición de notas internas.
                </p>
              </div>
            </div>

            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                {authError}
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                disabled={signingIn}
                onClick={handleGoogleSignIn}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60"
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>
                  {signingIn
                    ? 'Conectando...'
                    : 'Iniciar sesión con Google'}
                </span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-900 text-slate-100 p-8 sm:p-10 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-white">
                Reglas verificadas en PostgreSQL
              </h2>
              <ul className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <li>
                  • Validación de peso positivo (&gt; 0 kg) y sucursal de origen distinta al destino.
                </li>
                <li>
                  • Secuencia estricta recibida → en tránsito → entregada con bloqueo posterior a la entrega.
                </li>
                <li>
                  • Control de cupo diario por sucursal mediante bloqueo transaccional SELECT ... FOR UPDATE.
                </li>
                <li>
                  • Búsqueda textual combinada con sucursal, estado, período, orden y paginación.
                </li>
              </ul>
            </div>
            <div className="text-xs text-slate-400 border-t border-slate-800 pt-4">
              Acceso autenticado con verificación en servidor.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof LayoutDashboard;
    adminOnly?: boolean;
  }> = [
    { id: 'dashboard', label: 'Panel de control', icon: LayoutDashboard },
    { id: 'parcels', label: 'Encomiendas', icon: Package },
    { id: 'branches', label: 'Sucursales', icon: Building2 },
    {
      id: 'verification',
      label: 'Pruebas obligatorias',
      icon: ClipboardCheck,
      adminOnly: true,
    },
    { id: 'users', label: 'Usuarios', icon: Users, adminOnly: true },
  ];

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || effectiveRole === 'admin'
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-slate-900 text-slate-100 border-r border-slate-800">
        <div className="h-16 px-6 flex items-center border-b border-slate-800">
          <span className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">
            RutaControl
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2 text-xs">
          <div className="text-slate-400">Sesión verificada</div>
          <div className="text-slate-100 font-medium truncate">
            {dbUser.email}
          </div>
          <div className="text-slate-300">
            Perfil:{' '}
            <span className="font-semibold text-white">
              {effectiveRole === 'admin'
                ? 'Administrador'
                : 'Usuario de consulta'}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-full bg-slate-900 text-slate-100 flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="text-lg font-semibold text-white">
                RutaControl
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir navegación"
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
              <span className="font-medium text-slate-900 whitespace-nowrap">
                RutaControl
              </span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{TAB_LABELS[activeTab]}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {dbUser.role === 'admin' && (
              <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPreviewConsulta(false)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    !previewConsulta
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Administrador
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewConsulta(true)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    previewConsulta
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Vista Consulta
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Salir</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
          <DecisionBanner
            decision={decision}
            onDismiss={() => setDecision(null)}
          />

          {activeTab === 'dashboard' && (
            <DashboardView
              summary={dashboard}
              loading={dashboardLoading}
              role={effectiveRole}
              onRefresh={loadDashboard}
              onNavigateParcels={(statusFilter?: ParcelStatus) => {
                setFilters((prev) => ({
                  ...prev,
                  status: statusFilter ?? '',
                  page: 1,
                }));
                setActiveTab('parcels');
              }}
            />
          )}

          {activeTab === 'parcels' && (
            <ParcelsView
              parcelsData={parcelsData}
              branches={branches}
              filters={filters}
              loading={parcelsLoading}
              role={effectiveRole}
              onFiltersChange={(next) =>
                setFilters((prev) => ({ ...prev, ...next }))
              }
              onResetFilters={() => setFilters(INITIAL_FILTERS)}
              onRefresh={refreshAll}
              onDecision={recordDecision}
            />
          )}

          {activeTab === 'branches' && (
            <BranchesView
              branches={branches}
              loading={branchesLoading}
              role={effectiveRole}
              onRefresh={refreshAll}
              onDecision={recordDecision}
            />
          )}

          {activeTab === 'verification' && effectiveRole === 'admin' && (
            <VerificationView
              role={effectiveRole}
              onRefreshAll={refreshAll}
              onDecision={recordDecision}
            />
          )}

          {activeTab === 'users' && effectiveRole === 'admin' && (
            <UsersView
              users={usersList}
              currentUserId={dbUser.id}
              loading={usersLoading}
              onRefresh={loadUsers}
              onDecision={recordDecision}
            />
          )}
        </main>
      </div>
    </div>
  );
}
