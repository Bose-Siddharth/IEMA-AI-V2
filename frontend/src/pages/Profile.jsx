import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { setUser } from '@/store/slices/authSlice';
import { Badge } from '@/components/ui/badge';

export default function Profile() {
  const user = useSelector((s) => s.auth.user);
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const dispatch = useDispatch();

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/me', { name });
      dispatch(setUser(data));
      toast.success('Profile updated');
    } catch (e) {
      toast.error('Failed to update');
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-medium tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">Your public account information.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center text-primary text-2xl font-semibold">
            {(user?.name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-display text-xl font-medium">{user?.name}</div>
            <div className="text-sm text-muted-foreground">{user?.email}</div>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">{user?.role}</Badge>
              <Badge variant="outline" className="text-xs">via {user?.provider}</Badge>
              {user?.email_verified && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">verified</Badge>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email} disabled />
          </div>
          <Button onClick={save} disabled={saving}>Save changes</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-display text-lg font-medium mb-4">Connected accounts</h3>
        <div className="space-y-2">
          {['Google', 'Apple', 'Microsoft', 'Facebook'].map((p) => (
            <div key={p} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <span className="text-sm">{p}</span>
              <Badge variant="outline" className="text-xs">Coming soon</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
