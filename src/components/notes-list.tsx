import { useEffect, useState } from 'react';
import { useNotesStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FilePlus, LogOut, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function NotesList() {
  const { notes, setSelectedNote, addNote } = useNotesStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || '');
      }
    });
  }, []);

  const handleNoteSelect = (noteId: string) => {
    setSelectedId(noteId);
    const note = notes.find(note => note.id === noteId);
    setSelectedNote(note || null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="w-80 border-r bg-muted/20 p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">Notes</h2>
          <span className="text-sm text-muted-foreground truncate">{userEmail}</span>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" onClick={handleSignOut} className="h-8 w-8 p-0">
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign Out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" onClick={addNote} className="h-8 w-8 p-0">
                <FilePlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Note</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2">
          {notes.map((note) => (
            <Tooltip key={note.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={selectedId === note.id ? "secondary" : "ghost"}
                  className="w-full justify-start text-left gap-2 text-muted-foreground hover:text-foreground relative z-10"
                  onClick={() => handleNoteSelect(note.id)}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <div className="truncate">
                    {note.title || 'Untitled Note'}
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={5} className="z-50">
                {note.title || 'Untitled Note'}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}