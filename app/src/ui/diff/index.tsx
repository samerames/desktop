import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as CodeMirror from 'react-codemirror'
import { Disposable, CompositeDisposable } from 'event-kit'

import { Repository } from '../../models/repository'
import { FileChange, WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelectionType, DiffLine, Diff as DiffModel, DiffLineType, DiffHunk } from '../../models/diff'
import { assertNever } from '../../lib/fatal-error'

import { LocalGitOperations, Commit } from '../../lib/local-git-operations'

import { DiffLineGutter } from './diff-line-gutter'

/** The props for the Diff component. */
interface IDiffProps {
  readonly repository: Repository

  /**
   * Whether the diff is readonly, e.g., displaying a historical diff, or the
   * diff's lines can be selected, e.g., displaying a change in the working
   * directory.
   */
  readonly readOnly: boolean

  /** The file whose diff should be displayed. */
  readonly file: FileChange | null

  /** The commit which contains the diff to display. */
  readonly commit: Commit | null

  /** Called when the includedness of lines or hunks has changed. */
  readonly onIncludeChanged?: (diffSelection: Map<number, boolean>) => void
}

interface IDiffState {
  readonly diff: DiffModel
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, IDiffState> {
  /**
   * The disposable that should be disposed of when the instance is unmounted.
   * This will be null when our CodeMirror instance hasn't been set up yet.
   */
  private codeMirrorDisposables: CompositeDisposable | null = null

  private codeMirror: any | null

  /**
   * We store the scroll position before reloading the same diff so that we can
   * restore it when we're done. If we're not reloading the same diff, this'll
   * be null.
   */
  private scrollPositionToRestore: { left: number, top: number } | null = null

  public constructor(props: IDiffProps) {
    super(props)

    this.state = { diff: new DiffModel([]) }
  }

  public componentWillReceiveProps(nextProps: IDiffProps) {
    this.loadDiff(nextProps.repository, nextProps.file, nextProps.commit)
  }

  public componentWillUnmount() {
    this.dispose()
  }

  private dispose() {
    const disposables = this.codeMirrorDisposables
    if (disposables) {
      disposables.dispose()
    }

    this.codeMirrorDisposables = null
    this.codeMirror = null
  }

  private async loadDiff(repository: Repository, file: FileChange | null, commit: Commit | null) {
    if (!file) {
      // clear whatever existing state
      this.setState({ diff: new DiffModel([]) })
      return
    }

    // If we're reloading the same file, we want to save the current scroll
    // position and restore it after the diff's been updated.
    const sameFile = file && this.props.file && file.id === this.props.file.id
    const codeMirror = this.codeMirror
    if (codeMirror && sameFile) {
      const scrollInfo = codeMirror.getScrollInfo()
      this.scrollPositionToRestore = { left: scrollInfo.left, top: scrollInfo.top }
    } else {
      this.scrollPositionToRestore = null
    }

    const sameCommit = commit && this.props.commit && commit.sha === this.props.commit.sha
    // If it's the same file and commit, we don't need to reload. Ah the joys of
    // immutability.
    if (sameFile && sameCommit) { return }

    const diff = await LocalGitOperations.getDiff(repository, file, commit)

    if (file instanceof WorkingDirectoryFileChange) {
      const diffSelection = file.selection
      const selectionType = diffSelection.getSelectionType()

      if (selectionType === DiffSelectionType.Partial) {
        diffSelection.selectedLines.forEach((value, index) => {
          const hunk = this.diffHunkForIndex(diff, index)
          if (hunk) {
            const relativeIndex = index - hunk.unifiedDiffStart
            const diffLine = hunk.lines[relativeIndex]
            if (diffLine) {
              diffLine.selected = value
            }
          }
        })
      } else {
        const includeAll = selectionType === DiffSelectionType.All ? true : false
        diff.setAllLines(includeAll)
      }
    }

    this.setState({ diff })
  }

  private diffHunkForIndex(diff: DiffModel, index: number): DiffHunk | null {
    const hunk = diff.hunks.find(h => {
      return index >= h.unifiedDiffStart && index <= h.unifiedDiffEnd
    })
    return hunk || null
  }

  private getClassName(type: DiffLineType): string {
    switch (type) {
      case DiffLineType.Add: return 'diff-add'
      case DiffLineType.Delete: return 'diff-delete'
      case DiffLineType.Context: return 'diff-context'
      case DiffLineType.Hunk: return 'diff-hunk'
    }

    return assertNever(type, `Unknown DiffLineType ${type}`)
  }

  private onIncludeChanged(line: DiffLine, rowIndex: number) {
    if (!this.props.onIncludeChanged) {
      return
    }

    const startLine = rowIndex
    const endLine = startLine

    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      console.error('cannot change selected lines when selected file is not a WorkingDirectoryFileChange')
      return
    }

    const newDiffSelection = new Map<number, boolean>()

    // populate the current state of the diff
    this.state.diff.hunks.forEach(hunk => {
      hunk.lines.forEach((line, index) => {
        if (line.type === DiffLineType.Add || line.type === DiffLineType.Delete) {
          const absoluteIndex = hunk.unifiedDiffStart + index
          newDiffSelection.set(absoluteIndex, line.selected)
        }
      })
    })

    const include = !line.selected

    // apply the requested change
    for (let i = startLine; i <= endLine; i++) {
      newDiffSelection.set(i, include)
    }

    this.props.onIncludeChanged(newDiffSelection)
  }

  private renderLine = (instance: any, line: any, element: HTMLElement) => {
    const index = instance.getLineNumber(line)
    const hunk = this.diffHunkForIndex(this.state.diff, index)
    if (hunk) {
      const relativeIndex = index - hunk.unifiedDiffStart
      const diffLine = hunk.lines[relativeIndex]
      if (diffLine) {
        const diffLineElement = element.children[0] as HTMLSpanElement

        const reactContainer = document.createElement('span')
        ReactDOM.render(
          <DiffLineGutter line={diffLine} readOnly={this.props.readOnly} onIncludeChanged={line => this.onIncludeChanged(line, index)}/>,
        reactContainer)
        element.insertBefore(reactContainer, diffLineElement)

        element.classList.add(this.getClassName(diffLine.type))
      }
    }
  }

  private restoreScrollPosition = () => {
    const codeMirror = this.codeMirror
    const scrollPosition = this.scrollPositionToRestore
    if (codeMirror && scrollPosition) {
      this.codeMirror.scrollTo(scrollPosition.left, scrollPosition.top)
    }
  }

  private configureEditor(editor: any | null) {
    if (!editor) { return }

    const codeMirror: any | null = editor.getCodeMirror()
    if (!codeMirror || codeMirror === this.codeMirror) { return }

    this.dispose()
    this.codeMirror = codeMirror

    const disposables = new CompositeDisposable()
    this.codeMirrorDisposables = disposables

    codeMirror.on('renderLine', this.renderLine)
    codeMirror.on('changes', this.restoreScrollPosition)

    disposables.add(new Disposable(() => {
      codeMirror.off('renderLine', this.renderLine)
      codeMirror.off('changes', this.restoreScrollPosition)
    }))
  }

  public render() {
    const file = this.props.file
    if (!file) {
      return (
        <div className='panel blankslate' id='diff'>
          No file selected
        </div>
      )
    }

    const invalidationProps = { path: file.path, selection: DiffSelectionType.None }
    if (file instanceof WorkingDirectoryFileChange) {
      invalidationProps.selection = file.selection.getSelectionType()
    }

    let diffText = ''

    this.state.diff.hunks.forEach(hunk => {
      hunk.lines.forEach(l => diffText += l.text + '\r\n')
    })

    const options = {
      lineNumbers: false,
      readOnly: true,
      showCursorWhenSelecting: false,
      cursorBlinkRate: -1,
      styleActiveLine: false,
      scrollbarStyle: 'native',
      lineWrapping: localStorage.getItem('soft-wrap-is-best-wrap') ? true : false,
    }

    return (
      <div className='panel' id='diff'>
        <CodeMirror
          className='diff-code-mirror'
          value={diffText}
          options={options}
          ref={(ref: any | null) => this.configureEditor(ref)}/>
      </div>
    )
  }
}
