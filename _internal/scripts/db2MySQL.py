import os
import sqlite3
import sys

import pymysql
from pymysql.err import DataError, IntegrityError, OperationalError

APP_DIR = os.environ.get("SEER_APP_DIR") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from settings import get_db_name, get_mysql_config, refresh_exports
from stdio_utf8 import setup as setup_stdio

setup_stdio()
refresh_exports()

DB_FOLDER_PATH = os.path.join(os.path.dirname(APP_DIR), "雷小伊", "data")
MYSQL_CONFIG = get_mysql_config()
TARGET_DB_NAME = get_db_name()


def get_all_db_files(folder_path):
    return [name for name in os.listdir(folder_path) if name.endswith(".db")]


def get_sqlite_column_max_length(sqlite_conn, table_name, column_name):
    cursor = sqlite_conn.cursor()
    try:
        cursor.execute(f"SELECT MAX(LENGTH({column_name})) FROM {table_name};")
        max_len = cursor.fetchone()[0] or 0
    except Exception:
        max_len = 0
    cursor.close()
    return max_len


def sqlite_table_to_mysql(sqlite_db_path, mysql_conn, mysql_cursor):
    sqlite_conn = sqlite3.connect(sqlite_db_path)
    sqlite_cursor = sqlite_conn.cursor()

    sqlite_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    tables = [table[0] for table in sqlite_cursor.fetchall()]
    db_name = os.path.basename(sqlite_db_path).replace(".db", "")
    print(f"\n[处理] 正在处理文件：{db_name}.db，共 {len(tables)} 张表")

    for table in tables:
        print(f"\n  [表] 处理表：{table}")

        sqlite_cursor.execute(f"PRAGMA table_info({table});")
        columns = sqlite_cursor.fetchall()

        mysql_cursor.execute(f"DROP TABLE IF EXISTS `{table}`;")
        create_sql = f"CREATE TABLE `{table}` ("

        for col in columns:
            col_name = col[1]
            col_type = col[2].upper()
            is_primary = col[5] == 1

            max_len = get_sqlite_column_max_length(sqlite_conn, table, col_name)

            if "INT" in col_type or "INTEGER" in col_type:
                mysql_type = "BIGINT"
                if is_primary:
                    mysql_type += " PRIMARY KEY AUTO_INCREMENT"
                else:
                    mysql_type += " NULL"
            elif "TEXT" in col_type or max_len > 255:
                mysql_type = "TEXT NULL"
            elif "VARCHAR" in col_type or "CHAR" in col_type:
                mysql_len = max_len + 10 if max_len > 0 else 255
                mysql_type = f"VARCHAR({mysql_len}) NULL"
            elif "REAL" in col_type or "FLOAT" in col_type:
                mysql_type = "DECIMAL(20,6) NULL"
            elif "DATE" in col_type or "DATETIME" in col_type:
                mysql_type = "DATETIME NULL"
            else:
                mysql_type = "TEXT NULL"

            create_sql += f"`{col_name}` {mysql_type}, "

        create_sql = create_sql.rstrip(", ") + ")"
        mysql_cursor.execute(create_sql)
        mysql_conn.commit()

        sqlite_cursor.execute(f"SELECT * FROM {table};")
        rows = sqlite_cursor.fetchall()
        if not rows:
            print(f"  [跳过] 表 {table} 无数据，跳过")
            continue

        placeholders = ", ".join(["%s"] * len(columns))
        insert_sql = f"INSERT INTO `{table}` VALUES ({placeholders})"

        success_count = 0
        for idx, row in enumerate(rows):
            try:
                mysql_cursor.execute(insert_sql, row)
                success_count += 1
            except (DataError, IntegrityError) as exc:
                print(f"  [失败] 第 {idx + 1} 行跳过：{exc}")
                continue
        mysql_conn.commit()
        print(f"  [完成] 表 {table} 导入完成：{success_count}/{len(rows)}")

    sqlite_cursor.close()
    sqlite_conn.close()


def main():
    if not os.path.isdir(DB_FOLDER_PATH):
        print(f"[失败] 图鉴目录不存在：{DB_FOLDER_PATH}")
        return False

    try:
        mysql_conn = pymysql.connect(**MYSQL_CONFIG)
        mysql_cursor = mysql_conn.cursor()
        print("[成功] MySQL 连接成功")
    except OperationalError as exc:
        print(f"[失败] MySQL 连接失败：{exc}")
        return False

    mysql_cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{TARGET_DB_NAME}` DEFAULT CHARSET utf8mb4")
    mysql_cursor.execute(f"USE `{TARGET_DB_NAME}`;")
    print(f"[成功] 已使用数据库 {TARGET_DB_NAME}")

    db_files = get_all_db_files(DB_FOLDER_PATH)
    if not db_files:
        print("[失败] 未找到 .db 文件")
        return False
    print(f"[信息] 找到 {len(db_files)} 个数据库文件")

    for db_file in db_files:
        db_path = os.path.join(DB_FOLDER_PATH, db_file)
        sqlite_table_to_mysql(db_path, mysql_conn, mysql_cursor)

    mysql_cursor.close()
    mysql_conn.close()
    print("\n[完成] 全部覆盖导入完成！")
    return True


if __name__ == "__main__":
    main()
