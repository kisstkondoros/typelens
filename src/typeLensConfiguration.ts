export class TypeLensConfiguration {
  public exclude: string[] = [];
  public blackbox: string[] = [];
  public blackboxTitle: string = "<< called from blackbox >>";
  public excludeself: boolean = true;
  public singular: string = "{0} reference";
  public plural: string = "{0} references";
  public noreferences: string = "no references found for {0}";
  public unusedcolor: string = "#999";
  public decorateunused: boolean = true;
  public skiplanguages: string[] = ["csharp", "jsonc"];
  public ignorelist: string[] = [
    "ngOnChanges",
    "ngOnInit",
    "ngDoCheck",
    "ngAfterContentInit",
    "ngAfterContentChecked",
    "ngAfterViewInit",
    "ngAfterViewChecked",
    "ngOnDestroy",
  ];

  public showReferencesForMethods = true;
  public showReferencesForFunctions = true;
  public showReferencesForProperties = true;
  public showReferencesForClasses = true;
  public showReferencesForInterfaces = true;
  public showReferencesForEnums = true;
  public showReferencesForConstants = true;
  public showReferencesForVariables = true;
}
