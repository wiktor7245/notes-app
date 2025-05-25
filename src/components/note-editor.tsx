import { useEffect, useState, useRef, useCallback } from 'react';
import { useNotesStore, Note } from '@/lib/store'; // Assuming Note type is exported from store
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Trash2, Eye, Edit } from 'lucide-react';
import { toast } from 'sonner';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

// Debounce utility
function debounce<T extends (...args: any[]) => void>(func: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  } as T;
}

export function NoteEditor() {
  const { selectedNote, updateNote, deleteNote, notes } = useNotesStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState(''); // HTML content from Quill
  const [isPreview, setIsPreview] = useState(true); // true = Quill read-only
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState(Date.now());

  const quillEditorRef = useRef<HTMLDivElement>(null);
  const quillInstanceRef = useRef<Quill | null>(null);

  const titleRef = useRef(title);
  const contentRef = useRef(content);
  const selectedNoteRef = useRef(selectedNote);
  const prevSelectedNoteIdRef = useRef<string | undefined>();

  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { selectedNoteRef.current = selectedNote; }, [selectedNote]);

  useEffect(() => {
    if (quillEditorRef.current && !quillInstanceRef.current) {
      const quill = new Quill(quillEditorRef.current, {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean'],
          ],
        },
        placeholder: 'Start writing your note...',
      });

      quill.on(Quill.events.TEXT_CHANGE, (delta, oldDelta, source) => {
        if (source === Quill.sources.USER) {
          const htmlContent = quill.root.innerHTML;
          const isEmptyContent = htmlContent === '<p><br></p>';
          setContent(isEmptyContent ? '' : htmlContent);
        }
      });
      quillInstanceRef.current = quill;
    }
  }, []);

  useEffect(() => {
    if (quillInstanceRef.current) {
      quillInstanceRef.current.enable(!isPreview);
    }
  }, [isPreview, quillInstanceRef.current]);

  const stableExecuteSave = useCallback(async (
    noteId: string,
    titleToSave: string,
    contentToSave: string,
    originalNote: Note | null | undefined
  ) => {
    if (!originalNote || (titleToSave === originalNote.title && contentToSave === originalNote.content)) {
      setHasUnsavedChanges(false);
      return true; // No actual changes to save or no original note to compare against
    }

    try {
      await updateNote(noteId, { title: titleToSave, content: contentToSave });
      setLastSavedTimestamp(Date.now());
      toast.success('Note saved successfully');
      setHasUnsavedChanges(false);
      return true;
    } catch (error) {
      toast.error('Failed to save note');
      console.error('Save error:', error);
      // Keep hasUnsavedChanges true as save failed
      return false;
    }
  }, [updateNote]);

  const debouncedAutoSave = useCallback(
    debounce(async () => {
      const currentSelectedNote = selectedNoteRef.current;
      if (currentSelectedNote) {
        await stableExecuteSave(
          currentSelectedNote.id,
          titleRef.current,
          contentRef.current,
          currentSelectedNote
        );
      }
      // If no selectedNote, auto-save for a new note is not handled here.
      // That would typically involve creating a new note first.
    }, 1500),
    [stableExecuteSave]
  );

  useEffect(() => {
    const quill = quillInstanceRef.current;
    if (selectedNote && quill) {
      const noteIdChanged = prevSelectedNoteIdRef.current !== selectedNote.id;
      setTitle(selectedNote.title);
      const currentQuillContent = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML;
      if (noteIdChanged || currentQuillContent !== (selectedNote.content || '')) {
        quill.setContents([]);
        if (selectedNote.content) {
          quill.clipboard.dangerouslyPasteHTML(0, selectedNote.content);
        }
      }
      setContent(selectedNote.content || '');
      if (noteIdChanged) {
        setIsPreview(true);
        quill.blur();
      } else if (!isPreview) {
        setTimeout(() => quill.focus(), 0);
      }
      setHasUnsavedChanges(false);
      prevSelectedNoteIdRef.current = selectedNote.id;
    } else if (!selectedNote && quill) {
      setTitle('');
      quill.setContents([]);
      setContent('');
      setIsPreview(false);
      setHasUnsavedChanges(false);
      prevSelectedNoteIdRef.current = undefined;
    }
  }, [selectedNote, isPreview]);

  useEffect(() => {
    const currentPersistedNote = selectedNoteRef.current;
    if (currentPersistedNote) {
      const titleChanged = title !== currentPersistedNote.title;
      const contentChanged = content !== currentPersistedNote.content;
      const changed = titleChanged || contentChanged;
      
      setHasUnsavedChanges(changed);
      if (changed) {
        debouncedAutoSave();
      }
    } else {
      // Handling for a new, unsaved note
      const changed = title !== '' || content !== '';
      setHasUnsavedChanges(changed);
      // Auto-saving a new note would require creating it first.
      // For now, just track if there are changes.
    }
  }, [title, content, debouncedAutoSave]);

  const handleManualSave = useCallback(async () => {
    const currentSelectedNote = selectedNoteRef.current;
    if (currentSelectedNote) {
      await stableExecuteSave(
        currentSelectedNote.id,
        titleRef.current, // Use ref for latest value
        contentRef.current, // Use ref for latest value
        currentSelectedNote
      );
    } else {
      // Logic for creating and saving a new note would go here
      // For example, call a createNote function from the store
      toast.info("No note selected to save. Create a new note first.");
    }
  }, [stableExecuteSave]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        handleManualSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  const handleDelete = async () => {
    if (!selectedNoteRef.current) return;
    // Optional: Add a confirmation dialog here
    try {
      await deleteNote(selectedNoteRef.current.id);
      toast.success('Note deleted successfully');
      // selectedNote will become null via store, triggering useEffect to clear editor
    } catch (error) {
      toast.error('Failed to delete note');
      console.error('Delete error:', error);
    }
  };

  const handleTogglePreview = () => {
    const quill = quillInstanceRef.current;
    if (!quill) return;

    if (!isPreview && hasUnsavedChanges) { // Switching from Edit to Preview with unsaved changes
      handleManualSave(); // Attempt to save before switching
    }
    setIsPreview(prev => {
      const newIsPreview = !prev;
      if (!newIsPreview) { // Switching to Edit mode
        setTimeout(() => quill.focus(), 0); // Focus editor
      } else { // Switching to Preview mode
        quill.blur();
      }
      return newIsPreview;
    });
  };

  // New handler for clicking the preview area to switch to edit mode
  const handlePreviewAreaClick = useCallback(() => {
    if (isPreview) {
      setIsPreview(false);
      // Focus will be handled by the useEffect that listens to `isPreview` changes
    }
  }, [isPreview]); // Depends on isPreview state

  // Conditional Rendering for Empty States
  if (!selectedNote && notes.length === 0) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-muted-foreground">
        <h2 className="text-xl font-semibold mb-2">No Notes Yet</h2>
        <p className="mb-4">Click the "New Note" button in the sidebar to get started.</p>
      </div>
    );
  }

  if (!selectedNote) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-muted-foreground">
        <h2 className="text-xl font-semibold mb-2">Select a Note</h2>
        <p>Choose a note from the list to view or edit it, or create a new one.</p>
      </div>
    );
  }

  // Main Editor JSX
  return (
    <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 h-screen max-h-screen overflow-hidden">
      {/* Header: Title Input and Delete Button */}
      <div className="flex items-center justify-between gap-2 md:gap-4 flex-shrink-0">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note Title"
          className="text-xl md:text-2xl font-semibold border-0 shadow-none focus-visible:ring-0 p-0 h-auto flex-grow bg-transparent"
          aria-label="Note Title"
          disabled={isPreview}
        />
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          title="Delete Note"
          className="gap-1 h-8 text-xs md:text-sm"
          aria-label="Delete Note"
        >
          <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
          Delete
        </Button>
      </div>

      {/* Action Toolbar: Save, Toggle Preview */}
      <div className="flex items-center justify-end sticky top-0 bg-background py-2 z-10 border-b mb-2 flex-shrink-0 gap-2">
        <Button
          onClick={handleManualSave}
          variant="secondary"
          size="sm"
          className="gap-1 h-8 text-xs md:text-sm"
          aria-label="Save Note"
          title="Save (Ctrl+S)"
          disabled={!hasUnsavedChanges && !selectedNoteRef.current} // Disable if no changes or no note
        >
          <Save className="h-3.5 w-3.5 md:h-4 md:w-4" />
          Save
          {hasUnsavedChanges && <span className="ml-1 text-xs opacity-70">(unsaved)</span>}
        </Button>
        <Button
          onClick={handleTogglePreview}
          variant="outline"
          size="sm"
          className="gap-1 h-8 text-xs md:text-sm"
          aria-label={isPreview ? "Switch to Edit Mode" : "Switch to Preview Mode"}
          title={isPreview ? "Switch to Edit Mode" : "Switch to Preview Mode"}
        >
          {isPreview ? (
            <> <Edit className="h-3.5 w-3.5 md:h-4 md:w-4" /> Edit </>
          ) : (
            <> <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" /> Preview </>
          )}
        </Button>
      </div>

      {/* Quill Editor Area */}
      <div
        className="flex-grow min-h-0 flex flex-col quill-editor-wrapper"
        onClick={handlePreviewAreaClick} // Added onClick to switch to edit mode
        role={isPreview ? "button" : undefined} // Enhances accessibility
        tabIndex={isPreview ? 0 : undefined}    // Enhances accessibility
        onKeyDown={isPreview ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePreviewAreaClick(); } } : undefined} // Enhances accessibility
      >
        {/* This div is where Quill mounts. Its parent controls flex growth and scrolling. */}
        {/* Quill's own toolbar will be injected by the 'snow' theme. */}
        <div ref={quillEditorRef} className="h-full quill-editor-container flex flex-col" />
      </div>
    </div>
  );
}