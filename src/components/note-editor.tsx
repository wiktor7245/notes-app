import { useEffect, useState, useRef, useCallback } from 'react';
import { useNotesStore, Note } from '@/lib/store'; // Assuming Note type is exported from store
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Trash2, Eye, Edit } from 'lucide-react';
import { toast } from 'sonner';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

// Debounce utility (remains the same)
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

  // Initialize Quill Editor (runs once after initial render)
  useEffect(() => {
    if (quillEditorRef.current && !quillInstanceRef.current) {
      console.log("NoteEditor: Initializing Quill...");
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
      console.log("NoteEditor: Quill initialized. Initial isPreview:", isPreview, "Setting Quill enabled:", !isPreview);
      quill.enable(!isPreview); // Set initial enabled state
    }
  }, []); // Empty dependency array ensures this runs only once

  // Effect to sync Quill's readOnly state with isPreview
  useEffect(() => {
    if (quillInstanceRef.current) {
      console.log("NoteEditor: isPreview changed to", isPreview, ". Setting Quill enabled:", !isPreview);
      quillInstanceRef.current.enable(!isPreview);
    } else {
      console.warn("NoteEditor: Quill instance not available when isPreview changed.");
    }
  }, [isPreview]); // Runs when isPreview changes

  // Effect to load note data into editor when selectedNote changes or when switching view modes
  useEffect(() => {
    const quill = quillInstanceRef.current;
    console.log("NoteEditor: selectedNote/isPreview Effect. SelectedNote ID:", selectedNote?.id, "Quill instance exists:", !!quill, "isPreview:", isPreview);

    if (selectedNote && quill) {
      const noteIdChanged = prevSelectedNoteIdRef.current !== selectedNote.id;
      console.log(`NoteEditor: Loading note. ID: ${selectedNote.id}, Title: ${selectedNote.title}, ID changed: ${noteIdChanged}`);
      
      setTitle(selectedNote.title);

      const currentQuillContent = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML;
      if (noteIdChanged || currentQuillContent !== (selectedNote.content || '')) {
        console.log("NoteEditor: Updating Quill content.");
        quill.setContents([]); // Clear editor
        if (selectedNote.content) {
          try {
            quill.clipboard.dangerouslyPasteHTML(0, selectedNote.content);
          } catch (e) {
            console.error("NoteEditor: Error pasting HTML into Quill:", e);
          }
        } else {
          console.log("NoteEditor: Selected note has no content to paste.");
        }
      } else {
        console.log("NoteEditor: Quill content matches selected note, no update needed.");
      }
      setContent(selectedNote.content || '');

      if (noteIdChanged) {
        console.log("NoteEditor: Note ID changed, setting to preview mode.");
        setIsPreview(true); // Default to preview for a newly selected note
      } else if (!isPreview) { // Same note, and we are in edit mode
        console.log("NoteEditor: Same note, edit mode, focusing Quill.");
        setTimeout(() => quill.focus(), 0);
      }
      
      setHasUnsavedChanges(false);
      prevSelectedNoteIdRef.current = selectedNote.id;

    } else if (!selectedNote && quill) { // No note selected
      console.log("NoteEditor: No selected note, clearing editor.");
      setTitle('');
      quill.setContents([]);
      setContent('');
      setIsPreview(false); // Default to edit mode for a new (unsaved) note
      setHasUnsavedChanges(false);
      prevSelectedNoteIdRef.current = undefined;
    } else if (!quill && selectedNote) {
        console.warn("NoteEditor: Quill instance NOT available when trying to load selected note data.");
    } else if (!selectedNote && !quill) {
        console.log("NoteEditor: No selected note AND no Quill instance.");
    }
  }, [selectedNote, isPreview]);


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
    }, 1500),
    [stableExecuteSave]
  );

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
      console.log("NoteEditor: Toggling preview via button. New isPreview:", newIsPreview);
      // Focus/blur is handled by the main useEffect for [selectedNote, isPreview]
      // and the useEffect for [isPreview] that calls quill.enable()
      return newIsPreview;
    });
  };

  const handlePreviewAreaClick = useCallback(() => {
    if (isPreview) {
      console.log("NoteEditor: Preview area clicked, switching to edit mode.");
      setIsPreview(false);
    }
  }, [isPreview]);

  // Conditional Rendering for Empty States (remains the same)
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

  // Main Editor JSX (remains the same structurally)
  return (
    <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 h-screen max-h-screen overflow-hidden">
      {/* Header */}
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

      {/* Action Toolbar */}
      <div className="flex items-center justify-end sticky top-0 bg-background py-2 z-10 border-b mb-2 flex-shrink-0 gap-2">
        <Button
          onClick={handleManualSave}
          variant="secondary"
          size="sm"
          className="gap-1 h-8 text-xs md:text-sm"
          aria-label="Save Note"
          title="Save (Ctrl+S)"
          disabled={!hasUnsavedChanges && !selectedNoteRef.current}
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
        onClick={handlePreviewAreaClick}
        role={isPreview ? "button" : undefined}
        tabIndex={isPreview ? 0 : undefined}
        onKeyDown={isPreview ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePreviewAreaClick(); } } : undefined}
      >
        <div ref={quillEditorRef} className="h-full quill-editor-container flex flex-col" />
      </div>
    </div>
  );
}