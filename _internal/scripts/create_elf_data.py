import configparser
import os
import sys

import pymysql

APP_DIR = os.environ.get("SEER_APP_DIR") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from account_data import format_ini_display_name, get_latest_user_ini
from settings import MONSTERS_TXT_PATH, get_db_name, get_mysql_config, refresh_exports
from stdio_utf8 import setup as setup_stdio

setup_stdio()
refresh_exports()

USER_DIR = os.path.join(os.path.dirname(APP_DIR), "重聚", "seer_cfg", "user")
MONSTERS_TXT_PATH = MONSTERS_TXT_PATH
MYSQL_CONFIG = get_mysql_config()
DB_NAME = get_db_name()
TABLE_NAME = "raw_elf_data"


def parse_elf_section(ini_path):
    config = configparser.ConfigParser()
    config.optionxform = str

    try:
        config.read(ini_path, encoding="gbk")
    except Exception:
        config.read(ini_path, encoding="gb2312")

    lines = []
    pairs = []
    if "精灵" in config:
        for ts, elf_id in config["精灵"].items():
            lines.append(f"{ts}={elf_id}")
            try:
                pairs.append((int(ts), int(elf_id)))
            except ValueError:
                pass
    return lines, pairs


def write_raw_txt(lines, txt_path):
    os.makedirs(os.path.dirname(txt_path), exist_ok=True)
    with open(txt_path, "w", encoding="utf-8") as file:
        file.write("\n".join(lines))
    print(f"[成功] 已写入 {len(lines)} 行到 {txt_path}")


def overwrite_mysql_table(pairs):
    conn = pymysql.connect(**MYSQL_CONFIG)
    cursor = conn.cursor()
    cursor.execute(f"USE `{DB_NAME}`")
    print(f"[成功] 已切换到数据库：{DB_NAME}")

    create_sql = f"""
    CREATE TABLE IF NOT EXISTS `{TABLE_NAME}` (
        `uid` BIGINT,
        `monster_id` INT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """
    cursor.execute(create_sql)
    print(f"[成功] 表 {TABLE_NAME} 已确保存在")
    cursor.execute(f"TRUNCATE TABLE `{TABLE_NAME}`")

    if pairs:
        insert_sql = f"INSERT INTO `{TABLE_NAME}`(`uid`, `monster_id`) VALUES (%s, %s)"
        cursor.executemany(insert_sql, pairs)
        conn.commit()

    cursor.close()
    conn.close()
    print(f"[成功] 数据库 {TABLE_NAME} 已覆盖导入 {len(pairs)} 条记录")


def main():
    ini_path = get_latest_user_ini(USER_DIR)
    if not ini_path:
        print("[失败] 未找到用户INI文件")
        return False

    print(f"[成功] 读取文件: {format_ini_display_name(os.path.basename(ini_path))}")
    lines, pairs = parse_elf_section(ini_path)

    if not lines:
        print("[失败] [精灵] 段为空")
        return False

    write_raw_txt(lines, MONSTERS_TXT_PATH)
    overwrite_mysql_table(pairs)
    print("\n[完成] 全部完成！")
    return True


if __name__ == "__main__":
    main()
