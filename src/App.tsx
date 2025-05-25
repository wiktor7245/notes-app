import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { useNotesStore } from '@/lib/store';
import { NotesList } from '@/components/notes-list';
import { NoteEditor } from '@/components/note-editor';
import { AuthForm } from '@/components/auth-form';
import { supabase } from '@/lib/supabase';
import { TooltipProvider } from '@/components/ui/tooltip';

function App() {
  const { fetchNotes } = useNotesStore();
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchNotes();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchNotes();
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchNotes]);

  if (!session) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="notes-theme">
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <AuthForm />
          </div>
        </TooltipProvider>
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="notes-theme">
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <div className="flex h-screen w-screen overflow-hidden">
            <NotesList />
            <NoteEditor/>
          </div>
        </div>
      </TooltipProvider>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;