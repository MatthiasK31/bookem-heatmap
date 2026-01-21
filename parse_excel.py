#!/usr/bin/env python3
"""
Excel Parser for Bookem Heatmap Data
Parses Excel files and converts them to JSON/TypeScript format for the heatmap application.
"""

import pandas as pd
import json
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional


def parse_book_data(df: pd.DataFrame, 
                    lat_col: str = 'lat', 
                    lng_col: str = 'lng', 
                    count_col: str = 'count') -> List[Dict[str, Any]]:
    """
    Parse book data from DataFrame.
    
    Args:
        df: DataFrame containing book data
        lat_col: Column name for latitude
        lng_col: Column name for longitude
        count_col: Column name for book count
    
    Returns:
        List of book data dictionaries
    """
    book_data = []
    
    for _, row in df.iterrows():
        try:
            book_data.append({
                'lat': float(row[lat_col]),
                'lng': float(row[lng_col]),
                'count': int(row[count_col])
            })
        except (ValueError, KeyError) as e:
            print(f"Warning: Skipping row due to error: {e}")
            continue
    
    return book_data


def parse_volunteers(df: pd.DataFrame,
                     id_col: str = 'id',
                     lat_col: str = 'lat',
                     lng_col: str = 'lng',
                     name_col: str = 'name',
                     books_col: str = 'books') -> List[Dict[str, Any]]:
    """
    Parse volunteer data from DataFrame.
    
    Args:
        df: DataFrame containing volunteer data
        id_col: Column name for ID
        lat_col: Column name for latitude
        lng_col: Column name for longitude
        name_col: Column name for volunteer name
        books_col: Column name for number of books
    
    Returns:
        List of volunteer data dictionaries
    """
    volunteers = []
    
    for idx, row in df.iterrows():
        try:
            volunteer_id = int(row[id_col]) if id_col in row else idx + 1
            volunteers.append({
                'id': volunteer_id,
                'lat': float(row[lat_col]),
                'lng': float(row[lng_col]),
                'name': str(row[name_col]),
                'books': int(row[books_col])
            })
        except (ValueError, KeyError) as e:
            print(f"Warning: Skipping volunteer row due to error: {e}")
            continue
    
    return volunteers


def parse_schools(df: pd.DataFrame,
                  id_col: str = 'id',
                  lat_col: str = 'lat',
                  lng_col: str = 'lng',
                  name_col: str = 'name',
                  students_col: str = 'students') -> List[Dict[str, Any]]:
    """
    Parse school data from DataFrame.
    
    Args:
        df: DataFrame containing school data
        id_col: Column name for ID
        lat_col: Column name for latitude
        lng_col: Column name for longitude
        name_col: Column name for school name
        students_col: Column name for number of students
    
    Returns:
        List of school data dictionaries
    """
    schools = []
    
    for idx, row in df.iterrows():
        try:
            school_id = int(row[id_col]) if id_col in row else idx + 1
            schools.append({
                'id': school_id,
                'lat': float(row[lat_col]),
                'lng': float(row[lng_col]),
                'name': str(row[name_col]),
                'students': int(row[students_col])
            })
        except (ValueError, KeyError) as e:
            print(f"Warning: Skipping school row due to error: {e}")
            continue
    
    return schools


def auto_detect_columns(df: pd.DataFrame, data_type: str) -> Dict[str, str]:
    """
    Automatically detect column names based on common patterns.
    
    Args:
        df: DataFrame to analyze
        data_type: Type of data ('books', 'volunteers', 'schools')
    
    Returns:
        Dictionary mapping standard names to detected column names
    """
    columns_lower = {col.lower(): col for col in df.columns}
    mapping = {}
    
    if data_type == 'books':
        # Try to find latitude column
        for pattern in ['lat', 'latitude', 'y', 'coord_y']:
            if pattern in columns_lower:
                mapping['lat'] = columns_lower[pattern]
                break
        
        # Try to find longitude column
        for pattern in ['lng', 'lon', 'long', 'longitude', 'x', 'coord_x']:
            if pattern in columns_lower:
                mapping['lng'] = columns_lower[pattern]
                break
        
        # Try to find count column
        for pattern in ['count', 'books', 'book_count', 'quantity', 'num']:
            if pattern in columns_lower:
                mapping['count'] = columns_lower[pattern]
                break
    
    elif data_type == 'volunteers':
        for pattern in ['id', 'volunteer_id', 'vol_id']:
            if pattern in columns_lower:
                mapping['id'] = columns_lower[pattern]
                break
        
        for pattern in ['lat', 'latitude', 'y']:
            if pattern in columns_lower:
                mapping['lat'] = columns_lower[pattern]
                break
        
        for pattern in ['lng', 'lon', 'long', 'longitude', 'x']:
            if pattern in columns_lower:
                mapping['lng'] = columns_lower[pattern]
                break
        
        for pattern in ['name', 'volunteer_name', 'vol_name', 'full_name']:
            if pattern in columns_lower:
                mapping['name'] = columns_lower[pattern]
                break
        
        for pattern in ['books', 'book_count', 'books_distributed']:
            if pattern in columns_lower:
                mapping['books'] = columns_lower[pattern]
                break
    
    elif data_type == 'schools':
        for pattern in ['id', 'school_id']:
            if pattern in columns_lower:
                mapping['id'] = columns_lower[pattern]
                break
        
        for pattern in ['lat', 'latitude', 'y']:
            if pattern in columns_lower:
                mapping['lat'] = columns_lower[pattern]
                break
        
        for pattern in ['lng', 'lon', 'long', 'longitude', 'x']:
            if pattern in columns_lower:
                mapping['lng'] = columns_lower[pattern]
                break
        
        for pattern in ['name', 'school_name', 'school']:
            if pattern in columns_lower:
                mapping['name'] = columns_lower[pattern]
                break
        
        for pattern in ['students', 'student_count', 'num_students']:
            if pattern in columns_lower:
                mapping['students'] = columns_lower[pattern]
                break
    
    return mapping


def parse_excel_file(file_path: str, 
                     sheet_names: Optional[Dict[str, str]] = None,
                     column_mappings: Optional[Dict[str, Dict[str, str]]] = None) -> Dict[str, Any]:
    """
    Parse Excel file and extract book data, volunteers, and schools.
    
    Args:
        file_path: Path to Excel file
        sheet_names: Dictionary mapping data types to sheet names
                    e.g., {'books': 'Sheet1', 'volunteers': 'Sheet2', 'schools': 'Sheet3'}
        column_mappings: Dictionary of column mappings for each data type
                        e.g., {'books': {'lat': 'Latitude', 'lng': 'Longitude'}}
    
    Returns:
        Dictionary containing parsed data
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"Excel file not found: {file_path}")
    
    # Default sheet names if not provided
    if sheet_names is None:
        sheet_names = {
            'books': None,  # Will try first sheet
            'volunteers': None,
            'schools': None
        }
    
    # Default column mappings
    if column_mappings is None:
        column_mappings = {}
    
    result = {
        'bookData': [],
        'volunteers': [],
        'schools': []
    }
    
    # Read Excel file
    excel_file = pd.ExcelFile(file_path)
    available_sheets = excel_file.sheet_names
    
    print(f"Available sheets: {', '.join(available_sheets)}")
    
    # Parse books data
    if 'books' in sheet_names:
        sheet_name = sheet_names['books'] or available_sheets[0]
        if sheet_name in available_sheets:
            df_books = pd.read_excel(excel_file, sheet_name=sheet_name)
            print(f"\nParsing books from sheet: {sheet_name}")
            print(f"Columns: {', '.join(df_books.columns)}")
            
            # Auto-detect columns if not provided
            if 'books' not in column_mappings:
                detected = auto_detect_columns(df_books, 'books')
                column_mappings['books'] = detected
                print(f"Auto-detected columns: {detected}")
            
            mapping = column_mappings['books']
            result['bookData'] = parse_book_data(
                df_books,
                lat_col=mapping.get('lat', 'lat'),
                lng_col=mapping.get('lng', 'lng'),
                count_col=mapping.get('count', 'count')
            )
            print(f"Parsed {len(result['bookData'])} book data points")
    
    # Parse volunteers data
    if 'volunteers' in sheet_names:
        sheet_name = sheet_names['volunteers'] or (available_sheets[1] if len(available_sheets) > 1 else available_sheets[0])
        if sheet_name in available_sheets:
            df_volunteers = pd.read_excel(excel_file, sheet_name=sheet_name)
            print(f"\nParsing volunteers from sheet: {sheet_name}")
            print(f"Columns: {', '.join(df_volunteers.columns)}")
            
            if 'volunteers' not in column_mappings:
                detected = auto_detect_columns(df_volunteers, 'volunteers')
                column_mappings['volunteers'] = detected
                print(f"Auto-detected columns: {detected}")
            
            mapping = column_mappings['volunteers']
            result['volunteers'] = parse_volunteers(
                df_volunteers,
                id_col=mapping.get('id', 'id'),
                lat_col=mapping.get('lat', 'lat'),
                lng_col=mapping.get('lng', 'lng'),
                name_col=mapping.get('name', 'name'),
                books_col=mapping.get('books', 'books')
            )
            print(f"Parsed {len(result['volunteers'])} volunteers")
    
    # Parse schools data
    if 'schools' in sheet_names:
        sheet_name = sheet_names['schools'] or (available_sheets[2] if len(available_sheets) > 2 else available_sheets[0])
        if sheet_name in available_sheets:
            df_schools = pd.read_excel(excel_file, sheet_name=sheet_name)
            print(f"\nParsing schools from sheet: {sheet_name}")
            print(f"Columns: {', '.join(df_schools.columns)}")
            
            if 'schools' not in column_mappings:
                detected = auto_detect_columns(df_schools, 'schools')
                column_mappings['schools'] = detected
                print(f"Auto-detected columns: {detected}")
            
            mapping = column_mappings['schools']
            result['schools'] = parse_schools(
                df_schools,
                id_col=mapping.get('id', 'id'),
                lat_col=mapping.get('lat', 'lat'),
                lng_col=mapping.get('lng', 'lng'),
                name_col=mapping.get('name', 'name'),
                students_col=mapping.get('students', 'students')
            )
            print(f"Parsed {len(result['schools'])} schools")
    
    return result


def export_to_json(data: Dict[str, Any], output_path: str):
    """Export parsed data to JSON file."""
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"\nData exported to JSON: {output_path}")


def export_to_typescript(data: Dict[str, Any], output_path: str):
    """Export parsed data to TypeScript format."""
    with open(output_path, 'w') as f:
        f.write("// Auto-generated from Excel file\n")
        f.write("// Book Data\n")
        f.write("export const bookData = ")
        f.write(json.dumps(data['bookData'], indent=2))
        f.write(";\n\n")
        
        f.write("// Volunteers\n")
        f.write("export const volunteers = ")
        f.write(json.dumps(data['volunteers'], indent=2))
        f.write(";\n\n")
        
        f.write("// Schools\n")
        f.write("export const schools = ")
        f.write(json.dumps(data['schools'], indent=2))
        f.write(";\n")
    
    print(f"\nData exported to TypeScript: {output_path}")


def main():
    """Main function to run the Excel parser."""
    if len(sys.argv) < 2:
        print("Usage: python parse_excel.py <excel_file> [output_format] [output_file]")
        print("\nOptions:")
        print("  excel_file: Path to Excel file (.xlsx or .xls)")
        print("  output_format: 'json' or 'ts' (default: json)")
        print("  output_file: Output file path (default: data.json or data.ts)")
        print("\nExample:")
        print("  python parse_excel.py data.xlsx json output.json")
        print("  python parse_excel.py data.xlsx ts data.ts")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    output_format = sys.argv[2] if len(sys.argv) > 2 else 'json'
    output_file = sys.argv[3] if len(sys.argv) > 3 else None
    
    try:
        # Parse Excel file
        # You can customize sheet names and column mappings here
        data = parse_excel_file(
            excel_file,
            sheet_names={
                'books': None,  # Will use first sheet or specify name
                'volunteers': None,
                'schools': None
            }
        )
        
        # Export data
        if output_format.lower() == 'ts' or output_format.lower() == 'typescript':
            output_path = output_file or 'data.ts'
            export_to_typescript(data, output_path)
        else:
            output_path = output_file or 'data.json'
            export_to_json(data, output_path)
        
        print(f"\n✓ Successfully parsed Excel file!")
        print(f"  - Book data points: {len(data['bookData'])}")
        print(f"  - Volunteers: {len(data['volunteers'])}")
        print(f"  - Schools: {len(data['schools'])}")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

