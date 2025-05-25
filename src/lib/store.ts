import { create } from 'zustand';
import { supabase } from './supabase';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface NotesState {
  notes: Note[];
  selectedNote: Note | null;
  loading: boolean;
  setNotes: (notes: Note[]) => void;
  addNote: () => Promise<void>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  setSelectedNote: (note: Note | null) => void;
  fetchNotes: () => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  selectedNote: null,
  loading: false,
  setNotes: (notes) => set({ notes }),
  addNote: async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const notes = get().notes;
      const untitledCount = notes.filter(note => note.title.startsWith('Untitled Note')).length;
      const title = untitledCount === 0 ? 'Untitled Note' : `Untitled Note (${untitledCount + 1})`;

      const { data: note, error } = await supabase
        .from('notes')
        .insert([
          {
            title,
            content: '',
            user_id: user.id,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        notes: [note, ...state.notes],
        selectedNote: note,
      }));
    } catch (error) {
      console.error('Error creating note:', error);
    }
  },
  updateNote: async (id, updates) => {
    try {
      const { data: note, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? note : n)),
        selectedNote: state.selectedNote?.id === id ? note : state.selectedNote,
      }));
    } catch (error) {
      console.error('Error updating note:', error);
    }
  },
  deleteNote: async (id) => {
    try {
      const { error } = await supabase.from('notes').delete().eq('id', id);

      if (error) throw error;

      set((state) => ({
        notes: state.notes.filter((note) => note.id !== id),
        selectedNote: state.selectedNote?.id === id ? null : state.selectedNote,
      }));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  },
  setSelectedNote: (note) => set({ selectedNote: note }),
  fetchNotes: async () => {
    set({ loading: true });
    try {
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      set({ notes: notes || [], loading: false });
    } catch (error) {
      console.error('Error fetching notes:', error);
      set({ loading: false });
    }
  },
}));