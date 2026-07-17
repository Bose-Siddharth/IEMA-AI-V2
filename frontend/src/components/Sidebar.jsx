import { useSelector, useDispatch } from 'react-redux';
import { NavLink, useNavigate } from 'react-router-dom';
import { toggleSidebar, setTheme } from '@/store/slices/uiSlice';
import { logout } from '@/store/slices/authSlice';
import {
  MessageSquare, Sparkles, BarChart3, Wallet, CreditCard, Bell,
  User as UserIcon, Settings, Shield, PanelLeft, PanelLeftClose,
  Briefcase, Rocket, FileText, GraduationCap, MessagesSquare, Users, Lock, Plus, LogOut,
  Sun, Moon, Monitor, FlaskConical, Heart, Award, MapPin, Wrench, Code2
} from 'lucide-react';
import { NAV } from '@/constants/testIds';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const primaryNav = [
  { to: '/chat', label: 'AI Workspace', Icon: MessageSquare, tid: NAV.linkChat },
  { to: '/studio', label: 'AI Studio', Icon: Sparkles, tid: 'nav-studio' },
  { to: '/builder', label: 'Code Builder', Icon: Code2, tid: 'nav-builder' },
  { to: '/career', label: 'Career Intelligence', Icon: Briefcase, tid: 'nav-career' },
  { to: '/usage', label: 'Usage', Icon: BarChart3, tid: NAV.linkUsage },
  { to: '/wallet', label: 'Credit Wallet', Icon: Wallet, tid: NAV.linkWallet },
  { to: '/billing', label: 'Billing', Icon: CreditCard, tid: NAV.linkBilling },
  { to: '/notifications', label: 'Notifications', Icon: Bell, tid: NAV.linkNotifications },
  { to: '/profile', label: 'Profile', Icon: UserIcon, tid: NAV.linkProfile },
  { to: '/settings', label: 'Settings', Icon: Settings, tid: NAV.linkSettings },
];

const comingSoon = [
  { label: 'Startup Intelligence', Icon: Rocket },
  { label: 'Research Intelligence', Icon: FlaskConical },
  { label: 'Dynamic Course Engine', Icon: GraduationCap },
  { label: 'Resume Intelligence', Icon: FileText },
  { label: 'Mock Interviews', Icon: MessagesSquare },
  { label: 'Counselling', Icon: Heart },
  { label: 'Scholarships', Icon: Award },
  { label: 'Internships', Icon: MapPin },
  { label: 'Freelance Intelligence', Icon: Wrench },
];

export default function Sidebar({ onMobileClose, mobile = false }) {
  const collapsed = useSelector((s) => s.ui.sidebarCollapsed) && !mobile;
  const wallet = useSelector((s) => s.ui.walletBalance);
  const theme = useSelector((s) => s.ui.theme);
  const user = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  const linkClass = ({ isActive }) => cn(
    'group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
    'hover:bg-accent hover:text-accent-foreground',
    isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground'
  );

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-testid={NAV.sidebar}
        className={cn(
          'flex flex-col h-full bg-[hsl(var(--surface))] border-r border-border transition-[width] duration-200 ease-out',
          collapsed ? 'w-[64px]' : 'w-[260px]',
          mobile && 'w-[280px]'
        )}
      >
        {/* Top: Logo + Collapse */}
        <div className="flex items-center justify-between px-3 h-14 border-b border-border">
          <NavLink to="/chat" data-testid={NAV.logo} className="flex items-center gap-2 min-w-0" onClick={onMobileClose}>
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2} />
            </div>
            {!collapsed && (
              <span className="font-display font-semibold text-[15px] tracking-tight">IEMA<span className="text-primary">.</span>ai</span>
            )}
          </NavLink>
          {!mobile && (
            <Button
              data-testid={NAV.sidebarToggle}
              variant="ghost" size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => dispatch(toggleSidebar())}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {/* New chat */}
        <div className="p-2">
          <NavLink
            to="/chat?new=1"
            data-testid={NAV.newChatBtn}
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium',
              'hover:bg-accent hover:border-border transition-colors'
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {!collapsed && <span>New Chat</span>}
          </NavLink>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {primaryNav.map(({ to, label, Icon, tid }) => {
            const link = (
              <NavLink key={to} to={to} className={linkClass} data-testid={tid} onClick={onMobileClose}>
                <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            );
            return collapsed ? (
              <Tooltip key={to}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : link;
          })}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={linkClass} data-testid={NAV.linkAdmin} onClick={onMobileClose}>
              <Shield className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              {!collapsed && <span>Admin</span>}
            </NavLink>
          )}

          {!collapsed && (
            <div className="pt-6">
              <div className="px-2.5 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                Coming Soon
              </div>
              {comingSoon.map(({ label, Icon }) => (
                <div key={label} className="flex items-center gap-3 px-2.5 py-2 text-sm text-muted-foreground/60 cursor-not-allowed">
                  <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
                  <span className="truncate flex-1">{label}</span>
                  <Lock className="h-3 w-3 opacity-60" strokeWidth={2} />
                </div>
              ))}
            </div>
          )}
        </nav>

        {/* Footer: wallet + user */}
        <div className="border-t border-border p-2 space-y-1">
          {!collapsed && wallet !== null && (
            <div className="rounded-md bg-background border border-border p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Credits</div>
              <div className="font-display font-semibold text-lg" data-testid="sidebar-wallet-total">
                {Math.floor(wallet).toLocaleString()}
              </div>
              <NavLink to="/billing" className="text-xs text-primary hover:underline">Recharge →</NavLink>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md hover:bg-accent transition-colors p-2">
            <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
              {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate font-medium">{user?.name}</div>
                  <div className="text-xs truncate text-muted-foreground">{user?.email}</div>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={handleLogout}
                  data-testid="auth-logout-btn"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          {!collapsed && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" data-testid={NAV.themeToggle}>
                  {theme === 'dark' ? <Moon className="h-4 w-4" /> : theme === 'light' ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                  <span className="capitalize">{theme} theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => dispatch(setTheme('light'))}><Sun className="h-4 w-4 mr-2" /> Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => dispatch(setTheme('dark'))}><Moon className="h-4 w-4 mr-2" /> Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => dispatch(setTheme('system'))}><Monitor className="h-4 w-4 mr-2" /> System</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
