import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { setTheme } from '@/store/slices/uiSlice';
import { logout } from '@/store/slices/authSlice';

export default function Settings() {
  const theme = useSelector((s) => s.ui.theme);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    if (confirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      await api.delete('/auth/me');
      toast.success('Account permanently deleted');
      dispatch(logout());
      navigate('/');
    } catch (e) {
      toast.error('Failed to delete account');
    } finally { setDeleting(false); }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-medium tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage preferences and account.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <h3 className="font-display text-lg font-medium mb-4">Appearance</h3>
        <RadioGroup value={theme} onValueChange={(v) => dispatch(setTheme(v))}>
          {['light', 'dark', 'system'].map((t) => (
            <div key={t} className="flex items-center gap-3">
              <RadioGroupItem value={t} id={`theme-${t}`} />
              <Label htmlFor={`theme-${t}`} className="capitalize cursor-pointer">{t}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h3 className="font-display text-lg font-medium mb-2 text-destructive">Danger zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Deleting your account is permanent. Your conversations, credits and payment history will be erased.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" data-testid="delete-account-btn">Delete account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. All your data will be permanently removed.
                Type <span className="font-mono font-semibold text-destructive">DELETE</span> below to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              data-testid="delete-confirm-input"
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteAccount}
                disabled={confirmText !== 'DELETE' || deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="delete-confirm-btn"
              >
                {deleting ? 'Deleting...' : 'Permanently delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
