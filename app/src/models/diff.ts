
/** indicate what a line in the diff represents */
export enum DiffLineType {
  Context, Add, Delete, Hunk
}

/** track details related to each line in the diff */
export class DiffLine {
  public readonly text: string
  public readonly type: DiffLineType
  public readonly oldLineNumber: number | null
  public readonly newLineNumber: number | null
  public selected: boolean = false
  public readonly noTrailingNewLine: boolean

  public constructor(text: string, type: DiffLineType, oldLineNumber: number | null, newLineNuber: number | null, noTrailingNewLine: boolean = false) {
    this.text = text
    this.type = type
    this.oldLineNumber = oldLineNumber
    this.newLineNumber = newLineNuber
    this.noTrailingNewLine = noTrailingNewLine
  }

  public withNoTrailingNewLine(noTrailingNewLine: boolean): DiffLine {
    return new DiffLine(this.text, this.type, this.oldLineNumber, this.newLineNumber, noTrailingNewLine)
  }
}

/** details about the start and end of a diff hunk */
export class DiffHunkHeader {
  /** The line in the old (or original) file where this diff hunk starts */
  public readonly oldStartLine: number

  /** The number of lines in the old (or original) file that this diff hunk covers */
  public readonly oldLineCount: number

  /** The line in the new file where this diff hunk starts */
  public readonly newStartLine: number

  /** The number of lines in the new file that this diff hunk covers */
  public readonly newLineCount: number

  public constructor(oldStartLine: number, oldLineCount: number, newStartLine: number, newLineCount: number) {
    this.oldStartLine = oldStartLine
    this.oldLineCount = oldLineCount
    this.newStartLine = newStartLine
    this.newLineCount = newLineCount
  }
}

/** each diff is made up of a number of hunks */
export class DiffHunk {
  /** details from the diff hunk header about the line start and patch length */
  public readonly header: DiffHunkHeader
  /** the contents - context and changes - of the diff setion */
  public readonly lines: ReadonlyArray<DiffLine>
  /** the diff hunk's start position in the overall file diff */
  public readonly unifiedDiffStart: number
  /** the diff hunk's end position in the overall file diff */
  public readonly unifiedDiffEnd: number

  public constructor(header: DiffHunkHeader, lines: ReadonlyArray<DiffLine>, unifiedDiffStart: number, unifiedDiffEnd: number) {
    this.header = header
    this.unifiedDiffStart = unifiedDiffStart
    this.unifiedDiffEnd = unifiedDiffEnd
    this.lines = lines
  }
}

/** the contents of a diff generated by Git */
export class Diff {
   public readonly hunks: ReadonlyArray<DiffHunk>
   public readonly isBinary: boolean

   public constructor(hunks: ReadonlyArray<DiffHunk>, isBinary: boolean = false) {
     this.hunks = hunks
     this.isBinary = isBinary
   }

   public setAllLines(include: boolean) {
     this.hunks
        .forEach(hunk => {
          hunk.lines.forEach(line => {
            if (line.type === DiffLineType.Add || line.type === DiffLineType.Delete) {
              line.selected = include
            }
          })
        })
   }
}

export enum DiffSelectionType {
  All,
  Partial,
  None
}

export class DiffSelectionParser {
  /** iterate over the selected values and determine the all/none state  */
  private static parse(selection: Map<number, boolean>): { allSelected: boolean, noneSelected: boolean } {
      const toArray = Array.from(selection.values())

      const allSelected = toArray.every(k => k === true)
      const noneSelected = toArray.every(k => k === false)

      return { allSelected, noneSelected }
  }

  /** determine the selection state based on the selected lines */
  public static getState(selection: Map<number, boolean>): DiffSelectionType {
    const { allSelected, noneSelected } = DiffSelectionParser.parse(selection)

    if (allSelected) {
      return DiffSelectionType.All
    } else if (noneSelected) {
      return DiffSelectionType.None
    }

    return  DiffSelectionType.Partial
  }
}


/** encapsulate the selection of changes to a modified file in the working directory  */
export class DiffSelection {

  /** by default, the diff selection to include all lines */
  private readonly include: DiffSelectionType = DiffSelectionType.All

  /**
   *  Once the user has started selecting specific lines to include,
   *  these selections are tracked here - the key corresponds to the index
   *  in the unified diff, and the value indicates whether the line has been
   *  selected
   *
   *  @TODO there's an impedance mismatch here between the diff hunk, which
   *        each have indexes relative to themselves and might not be unique,
   *        and the user selecting a line, which need to be unique. Pondering
   *        on a better way to represent this...
   */
  public readonly selectedLines: Map<number, boolean>

  public constructor(include: DiffSelectionType, selectedLines: Map<number, boolean>) {
    this.include = include
    this.selectedLines = selectedLines
  }

  /**  return the current state of the diff selection */
  public getSelectionType(): DiffSelectionType {
    if (this.selectedLines.size === 0) {
      return this.include
    } else {
      return DiffSelectionParser.getState(this.selectedLines)
    }
  }
}
